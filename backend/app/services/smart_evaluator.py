import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.ai.llm_client import call_llm
from app.ai.prompts import SMART_EVALUATE_PROMPT
from app.models.ai_models import GoalAlert, SmartEvaluation
from app.models.hr_models import Goal
from app.schemas.evaluation import EvaluateGoalResponse, SmartScores
from app.config import settings


async def evaluate_goal(
    goal_text: str,
    position: str = "Сотрудник",
    department: str = "Подразделение",
    goal_id: uuid.UUID | None = None,
    employee_id: uuid.UUID | None = None,
    db: AsyncSession | None = None,
) -> EvaluateGoalResponse:
    prompt = SMART_EVALUATE_PROMPT.format(
        goal_text=goal_text,
        position=position,
        department=department,
    )

    result = await call_llm(prompt)

    scores_raw = result.get("scores", {})
    scores = SmartScores(
        S=float(scores_raw.get("S", 0.5)),
        M=float(scores_raw.get("M", 0.5)),
        A=float(scores_raw.get("A", 0.5)),
        R=float(scores_raw.get("R", 0.5)),
        T=float(scores_raw.get("T", 0.5)),
    )

    smart_index = float(result.get("smart_index", (scores.S + scores.M + scores.A + scores.R + scores.T) / 5))

    response = EvaluateGoalResponse(
        smart_index=round(smart_index, 2),
        scores=scores,
        goal_type=result.get("goal_type", "output"),
        alignment_level=result.get("alignment_level", "functional"),
        alignment_source=result.get("alignment_source"),
        weak_criteria=result.get("weak_criteria", []),
        recommendations=result.get("recommendations", []),
        rewrite=result.get("rewrite", ""),
        model_version=settings.openai_model,
    )

    # Сохраняем в БД если есть goal_id и сессия
    if goal_id and db:
        await _save_evaluation(response, goal_id, db)
        if smart_index < settings.smart_threshold and employee_id:
            await _create_alert(
                employee_id=employee_id,
                goal_id=goal_id,
                alert_type="low_smart",
                severity="warning",
                message=f"SMART-индекс цели {smart_index:.2f} ниже порога {settings.smart_threshold}. Слабые критерии: {', '.join(response.weak_criteria)}",
                db=db,
            )

    return response


async def _save_evaluation(
    response: EvaluateGoalResponse,
    goal_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    existing = await db.execute(
        select(SmartEvaluation).where(SmartEvaluation.goal_id == goal_id)
    )
    evaluation = existing.scalar_one_or_none()

    if evaluation:
        evaluation.score_s = response.scores.S
        evaluation.score_m = response.scores.M
        evaluation.score_a = response.scores.A
        evaluation.score_r = response.scores.R
        evaluation.score_t = response.scores.T
        evaluation.smart_index = response.smart_index
        evaluation.goal_type = response.goal_type
        evaluation.alignment_level = response.alignment_level
        evaluation.alignment_source = response.alignment_source
        evaluation.weak_criteria = response.weak_criteria
        evaluation.recommendations = response.recommendations
        evaluation.rewrite = response.rewrite
        evaluation.model_version = response.model_version
    else:
        evaluation = SmartEvaluation(
            goal_id=goal_id,
            score_s=response.scores.S,
            score_m=response.scores.M,
            score_a=response.scores.A,
            score_r=response.scores.R,
            score_t=response.scores.T,
            smart_index=response.smart_index,
            goal_type=response.goal_type,
            alignment_level=response.alignment_level,
            alignment_source=response.alignment_source,
            weak_criteria=response.weak_criteria,
            recommendations=response.recommendations,
            rewrite=response.rewrite,
            model_version=response.model_version,
        )
        db.add(evaluation)

    await db.commit()


async def _create_alert(
    employee_id: uuid.UUID,
    goal_id: uuid.UUID,
    alert_type: str,
    severity: str,
    message: str,
    db: AsyncSession,
) -> None:
    alert = GoalAlert(
        employee_id=employee_id,
        goal_id=goal_id,
        alert_type=alert_type,
        severity=severity,
        message=message,
    )
    db.add(alert)
    await db.commit()


async def batch_evaluate(
    employee_id: uuid.UUID,
    quarter: str,
    year: int,
    db: AsyncSession,
) -> dict:
    """
    Пакетная оценка всех целей сотрудника за квартал.
    """
    from sqlalchemy.orm import selectinload
    from app.models.hr_models import Employee

    # Достаём сотрудника
    emp_result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.department))
        .where(Employee.id == employee_id)
    )
    employee = emp_result.scalar_one_or_none()
    if not employee:
        return {"error": "Employee not found"}

    # Достаём цели
    goals_result = await db.execute(
        select(Goal).where(
            Goal.employee_id == employee_id,
            Goal.quarter == quarter,
            Goal.year == year,
        )
    )
    goals = goals_result.scalars().all()

    if not goals:
        # Алерт: нет целей
        await _create_alert(
            employee_id=employee_id,
            goal_id=None,
            alert_type="too_few_goals",
            severity="critical",
            message=f"На {quarter} {year} не поставлено ни одной цели",
            db=db,
        )
        return {"total_goals": 0, "alerts": ["Нет целей на квартал"]}

    position = employee.position.name if employee.position else "Сотрудник"
    department = employee.department.name if employee.department else "Подразделение"

    evaluated = []
    alerts = []
    total_weight = 0.0

    for goal in goals:
        text = goal.goal_text or goal.description or goal.title
        eval_result = await evaluate_goal(
            goal_text=text,
            position=position,
            department=department,
            goal_id=goal.id,
            employee_id=employee_id,
            db=db,
        )
        evaluated.append({"goal": goal, "eval": eval_result})
        if goal.weight:
            total_weight += goal.weight

    # Проверка суммы весов
    if abs(total_weight - 100.0) > 5 and total_weight > 0:
        alerts.append(f"Сумма весов целей {total_weight:.0f}% (должно быть 100%)")

    # Проверка количества
    if len(goals) < settings.min_goals:
        alerts.append(f"Мало целей: {len(goals)} (минимум {settings.min_goals})")
        await _create_alert(
            employee_id=employee_id,
            goal_id=None,
            alert_type="too_few_goals",
            severity="warning",
            message=f"Целей {len(goals)}, рекомендуется {settings.min_goals}–{settings.max_goals}",
            db=db,
        )
    if len(goals) > settings.max_goals:
        alerts.append(f"Много целей: {len(goals)} (максимум {settings.max_goals})")

    # Слабые критерии по всем целям
    criteria_scores = {"S": [], "M": [], "A": [], "R": [], "T": []}
    for item in evaluated:
        e = item["eval"]
        criteria_scores["S"].append(e.scores.S)
        criteria_scores["M"].append(e.scores.M)
        criteria_scores["A"].append(e.scores.A)
        criteria_scores["R"].append(e.scores.R)
        criteria_scores["T"].append(e.scores.T)

    avg_scores = {k: round(sum(v) / len(v), 2) for k, v in criteria_scores.items()}
    avg_smart = round(sum(item["eval"].smart_index for item in evaluated) / len(evaluated), 2)

    return {
        "employee_id": str(employee_id),
        "quarter": quarter,
        "total_goals": len(goals),
        "avg_smart": avg_smart,
        "weak_criteria_summary": avg_scores,
        "goals": [
            {
                "goal_id": str(item["goal"].id),
                "goal_text": item["goal"].goal_text or item["goal"].title,
                "smart_index": item["eval"].smart_index,
                "scores": item["eval"].scores.model_dump(),
                "goal_type": item["eval"].goal_type,
                "weak_criteria": item["eval"].weak_criteria,
            }
            for item in evaluated
        ],
        "alerts": alerts,
    }
