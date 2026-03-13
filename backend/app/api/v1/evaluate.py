from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.evaluation import (
    EvaluateGoalRequest,
    EvaluateGoalResponse,
    BatchEvaluateRequest,
    BatchEvaluateResponse,
)
from app.services.smart_evaluator import evaluate_goal, batch_evaluate

router = APIRouter(prefix="/evaluate", tags=["Оценка целей"])


@router.post("/goal", response_model=EvaluateGoalResponse)
async def evaluate_single_goal(
    request: EvaluateGoalRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    SMART-оценка одной цели.
    Принимает текст → возвращает оценки S/M/A/R/T, рекомендации, переформулировку.
    """
    return await evaluate_goal(
        goal_text=request.goal_text,
        position=request.position or "Сотрудник",
        department=request.department or "Подразделение",
        goal_id=request.employee_id,  # опционально, для сохранения в БД
        db=db,
    )


@router.post("/goal/{goal_id}", response_model=EvaluateGoalResponse)
async def evaluate_existing_goal(
    goal_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Оценивает существующую цель из БД по goal_id.
    """
    from sqlalchemy import select
    from app.models.hr_models import Goal, Employee

    result = await db.execute(
        select(Goal).where(Goal.id == goal_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Goal not found")

    # Достаём профиль сотрудника
    emp = await db.get(Employee, goal.employee_id)
    position = "Сотрудник"
    department = "Подразделение"
    if emp:
        pos = await db.get(__import__("app.models.hr_models", fromlist=["Position"]).Position, emp.position_id)
        dept = await db.get(__import__("app.models.hr_models", fromlist=["Department"]).Department, emp.department_id)
        position = pos.name if pos else position
        department = dept.name if dept else department

    goal_text = goal.goal_text or goal.description or goal.title

    return await evaluate_goal(
        goal_text=goal_text,
        position=position,
        department=department,
        goal_id=goal_id,
        employee_id=goal.employee_id,
        db=db,
    )


@router.post("/batch", response_model=BatchEvaluateResponse)
async def batch_evaluate_goals(
    request: BatchEvaluateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Пакетная оценка всех целей сотрудника за квартал.
    """
    result = await batch_evaluate(
        employee_id=request.employee_id,
        quarter=request.quarter,
        year=request.year,
        db=db,
    )
    return result
