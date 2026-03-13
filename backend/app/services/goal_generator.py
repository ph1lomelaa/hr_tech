import uuid
import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_client import call_llm
from app.ai.prompts import GENERATE_GOALS_PROMPT, REWRITE_GOAL_PROMPT
from app.models.hr_models import Employee, Goal
from app.models.ai_models import GenerationSession, SuggestedGoal
from app.services.rag_service import get_relevant_vnd, format_vnd_context
from app.services.smart_evaluator import evaluate_goal
from app.schemas.generation import (
    GenerateGoalsResponse,
    SuggestedGoalItem,
    RewriteGoalResponse,
)
from app.config import settings

logger = logging.getLogger(__name__)


async def generate_goals(
    employee_id: uuid.UUID,
    quarter: str,
    year: int,
    focus_direction: str | None,
    include_manager_goals: bool,
    db: AsyncSession,
) -> GenerateGoalsResponse:

    # 1. Загружаем профиль сотрудника
    emp_result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.department))
        .where(Employee.id == employee_id)
    )
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise ValueError(f"Employee {employee_id} not found")

    position = employee.position.name if employee.position else "Сотрудник"
    department = employee.department.name if employee.department else "Подразделение"

    # 2. Цели руководителя (каскадирование)
    manager_goals_text = "Нет данных о целях руководителя"
    manager_goals_list = []
    if include_manager_goals and employee.manager_id:
        mgr_result = await db.execute(
            select(Goal).where(
                Goal.employee_id == employee.manager_id,
                Goal.quarter == quarter,
                Goal.year == year,
            )
        )
        manager_goals = mgr_result.scalars().all()
        if manager_goals:
            manager_goals_list = [g.goal_text or g.title for g in manager_goals]
            manager_goals_text = "\n".join(f"- {g}" for g in manager_goals_list)

    # 3. RAG — релевантные ВНД
    chunks = await get_relevant_vnd(
        position=position,
        department=department,
        focus_direction=focus_direction,
    )
    vnd_context = format_vnd_context(chunks)
    docs_used = list({c["metadata"].get("doc_title", "") for c in chunks if c.get("metadata")})

    # 4. Генерация через LLM
    prompt = GENERATE_GOALS_PROMPT.format(
        count=settings.max_goals,
        position=position,
        department=department,
        quarter=quarter,
        year=year,
        focus_direction=focus_direction or "не задано",
        manager_goals=manager_goals_text,
        vnd_context=vnd_context,
    )

    llm_result = await call_llm(prompt, temperature=0.5)
    raw_goals = llm_result.get("goals", [])

    # 5. Сохраняем сессию
    session = GenerationSession(
        employee_id=employee_id,
        quarter=quarter,
        year=year,
        focus_direction=focus_direction,
        manager_goals={"goals": manager_goals_list},
    )
    db.add(session)
    await db.flush()

    # 6. Обрабатываем каждую сгенерированную цель
    suggestions = []
    for raw in raw_goals:
        goal_text = raw.get("goal_text", "")
        smart_index = float(raw.get("smart_index", 0.0))

        # Если SMART < порога — переформулируем
        if smart_index < settings.smart_threshold:
            rewrite_result = await call_llm(
                REWRITE_GOAL_PROMPT.format(
                    goal_text=goal_text,
                    position=position,
                    department=department,
                    weak_criteria=", ".join([]),
                )
            )
            goal_text = rewrite_result.get("rewritten", goal_text)
            # Переоцениваем
            eval_result = await evaluate_goal(goal_text=goal_text, position=position, department=department)
            smart_index = eval_result.smart_index

        # Парсим дедлайн
        deadline = None
        if raw.get("deadline"):
            try:
                deadline = date.fromisoformat(raw["deadline"])
            except (ValueError, TypeError):
                pass

        # Находим source_doc_id из чанков
        source_doc_id = None
        source_doc_title = raw.get("source_doc_title")
        for chunk in chunks:
            if chunk.get("metadata", {}).get("doc_title") == source_doc_title:
                try:
                    source_doc_id = uuid.UUID(chunk["metadata"].get("doc_id", ""))
                except (ValueError, TypeError):
                    pass
                break

        suggested = SuggestedGoal(
            session_id=session.id,
            employee_id=employee_id,
            goal_text=goal_text,
            metric=raw.get("metric"),
            deadline=deadline,
            weight_suggestion=raw.get("weight_suggestion"),
            smart_index=smart_index,
            goal_type=raw.get("goal_type", "output"),
            source_doc_id=source_doc_id,
            source_doc_title=source_doc_title,
            source_quote=raw.get("source_quote"),
            generation_context=raw.get("generation_context", ""),
        )
        db.add(suggested)
        await db.flush()

        suggestions.append(SuggestedGoalItem(
            id=suggested.id,
            goal_text=goal_text,
            metric=raw.get("metric"),
            deadline=deadline,
            weight_suggestion=raw.get("weight_suggestion"),
            smart_index=smart_index,
            goal_type=raw.get("goal_type", "output"),
            source_doc_title=source_doc_title,
            source_quote=raw.get("source_quote"),
            generation_context=raw.get("generation_context", ""),
        ))

    await db.commit()

    return GenerateGoalsResponse(
        session_id=session.id,
        employee_id=employee_id,
        quarter=quarter,
        suggestions=suggestions,
        manager_goals_used=manager_goals_list,
        documents_used=docs_used,
    )


async def accept_suggested_goal(
    suggested_goal_id: uuid.UUID,
    employee_id: uuid.UUID,
    weight: float | None,
    db: AsyncSession,
) -> uuid.UUID:
    """
    Принимает сгенерированную цель — создаёт запись в goals.
    """
    result = await db.execute(
        select(SuggestedGoal).where(SuggestedGoal.id == suggested_goal_id)
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        raise ValueError("Suggested goal not found")

    # Создаём реальную цель
    goal = Goal(
        employee_id=employee_id,
        title=suggestion.goal_text[:255],
        goal_text=suggestion.goal_text,
        metric=suggestion.metric,
        deadline=suggestion.deadline,
        weight=weight or suggestion.weight_suggestion,
        status="draft",
    )
    db.add(goal)
    await db.flush()

    # Обновляем статус предложения
    suggestion.status = "accepted"
    suggestion.accepted_goal_id = goal.id
    await db.commit()

    return goal.id


async def rewrite_goal(
    goal_text: str,
    position: str,
    department: str,
    weak_criteria: list[str] | None,
    db: AsyncSession,
) -> RewriteGoalResponse:
    from app.ai.prompts import REWRITE_GOAL_PROMPT

    # Оцениваем оригинал
    eval_before = await evaluate_goal(goal_text=goal_text, position=position, department=department)

    prompt = REWRITE_GOAL_PROMPT.format(
        goal_text=goal_text,
        position=position,
        department=department,
        weak_criteria=", ".join(weak_criteria or eval_before.weak_criteria),
    )

    result = await call_llm(prompt)
    rewritten = result.get("rewritten", goal_text)

    # Оцениваем результат
    eval_after = await evaluate_goal(goal_text=rewritten, position=position, department=department)

    return RewriteGoalResponse(
        original=goal_text,
        rewritten=rewritten,
        smart_index_before=eval_before.smart_index,
        smart_index_after=eval_after.smart_index,
        improvements=result.get("improvements", []),
    )
