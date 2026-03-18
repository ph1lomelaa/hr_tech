import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_guardrails import enforce_ai_rate_limit, run_with_ai_concurrency_guard
from app.database import get_db
from app.models.hr_models import Employee, Goal
from app.models.ai_models import SmartEvaluation
from app.security import ensure_employee_access, get_actor_context
from app.schemas.evaluation import (
    EvaluateGoalRequest,
    EvaluateGoalResponse,
    BatchEvaluateRequest,
    BatchEvaluateResponse,
)
from app.services.smart_evaluator import evaluate_goal, batch_evaluate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/evaluate", tags=["Оценка целей"])


@router.post("/goal", response_model=EvaluateGoalResponse)
async def evaluate_single_goal(
    request: EvaluateGoalRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    SMART-оценка произвольного текста цели.
    Принимает текст → возвращает оценки S/M/A/R/T, тип цели, стратегическую связку,
    рекомендации и AI-переформулировку.
    """
    position = request.position or "Сотрудник"
    department = request.department or "Подразделение"
    actor = await get_actor_context(http_request, db)
    await enforce_ai_rate_limit(actor, bucket="evaluate")

    if request.employee_id:
        await ensure_employee_access(
            actor=actor,
            target_employee_id=request.employee_id,
            db=db,
            detail="You cannot evaluate goals for this employee",
        )
        result = await db.execute(
            select(Employee)
            .options(selectinload(Employee.position), selectinload(Employee.department))
            .where(Employee.id == request.employee_id)
        )
        employee = result.scalar_one_or_none()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        if not request.position and employee.position:
            position = employee.position.name
        if not request.department and employee.department:
            department = employee.department.name

    return await run_with_ai_concurrency_guard(
        bucket="evaluate",
        operation=lambda: evaluate_goal(
            goal_text=request.goal_text,
            position=position,
            department=department,
            goal_id=None,       # текстовая оценка не привязана к конкретной цели в БД
            employee_id=request.employee_id,
            quarter=request.quarter,
            year=request.year,
            db=db,
        ),
    )


@router.post("/goal/{goal_id}", response_model=EvaluateGoalResponse)
async def evaluate_existing_goal(
    goal_id: UUID,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Оценивает существующую цель из БД по goal_id.
    """
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    actor = await get_actor_context(http_request, db)
    await enforce_ai_rate_limit(actor, bucket="evaluate")
    await ensure_employee_access(
        actor=actor,
        target_employee_id=goal.employee_id,
        db=db,
        detail="You cannot evaluate this goal",
    )

    # Достаём профиль сотрудника
    emp_result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.department))
        .where(Employee.id == goal.employee_id)
    )
    emp = emp_result.scalar_one_or_none()
    position = emp.position.name if emp and emp.position else "Сотрудник"
    department = emp.department.name if emp and emp.department else "Подразделение"

    goal_text = goal.goal_text or goal.description or goal.title

    return await run_with_ai_concurrency_guard(
        bucket="evaluate",
        operation=lambda: evaluate_goal(
            goal_text=goal_text,
            position=position,
            department=department,
            goal_id=goal_id,
            employee_id=goal.employee_id,
            quarter=goal.quarter,
            year=goal.year,
            db=db,
        ),
    )


@router.post("/batch", response_model=BatchEvaluateResponse)
async def batch_evaluate_goals(
    request: BatchEvaluateRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Пакетная оценка всех целей сотрудника за квартал.
    """
    actor = await get_actor_context(http_request, db)
    await enforce_ai_rate_limit(actor, bucket="batch")
    await ensure_employee_access(
        actor=actor,
        target_employee_id=request.employee_id,
        db=db,
        detail="You cannot run batch evaluation for this employee",
    )

    result = await run_with_ai_concurrency_guard(
        bucket="batch",
        operation=lambda: batch_evaluate(
            employee_id=request.employee_id,
            quarter=request.quarter,
            year=request.year,
            db=db,
        ),
    )
    if isinstance(result, dict) and result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/backfill", tags=["Оценка целей"])
async def backfill_missing_evaluations(
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    HR-только: оценить все цели, у которых нет SmartEvaluation (seed-данные, старые записи).
    Использует rule-based оценку для скорости. Возвращает количество обработанных целей.
    """
    actor = await get_actor_context(http_request, db)
    if actor.role != "hr":
        raise HTTPException(status_code=403, detail="Only HR can run backfill")

    # Цели без SmartEvaluation
    evaluated_goal_ids = select(SmartEvaluation.goal_id)
    result = await db.execute(
        select(Goal)
        .options(
            selectinload(Goal.employee).selectinload(Employee.position),
            selectinload(Goal.employee).selectinload(Employee.department),
        )
        .where(Goal.id.not_in(evaluated_goal_ids))
    )
    goals = result.scalars().all()

    processed = 0
    failed = 0
    for goal in goals:
        emp = goal.employee
        position = (emp.position.name if emp and emp.position else None) or goal.position or "Сотрудник"
        department = emp.department.name if emp and emp.department else "Подразделение"
        goal_text = goal.goal_text or goal.description or goal.title
        try:
            await evaluate_goal(
                goal_text=goal_text,
                position=position,
                department=department,
                goal_id=goal.id,
                employee_id=goal.employee_id,
                quarter=goal.quarter,
                year=goal.year,
                db=db,
                prefer_rule_based=True,   # быстро, без LLM
            )
            processed += 1
        except Exception as exc:
            logger.warning("Backfill failed for goal %s: %s", goal.id, exc)
            failed += 1

    return {"processed": processed, "failed": failed, "total_without_eval": len(goals)}
