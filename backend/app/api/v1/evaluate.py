from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.hr_models import Employee, Goal
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
    SMART-оценка произвольного текста цели.
    Принимает текст → возвращает оценки S/M/A/R/T, тип цели, стратегическую связку,
    рекомендации и AI-переформулировку.
    """
    position = request.position or "Сотрудник"
    department = request.department or "Подразделение"

    if request.employee_id:
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

    return await evaluate_goal(
        goal_text=request.goal_text,
        position=position,
        department=department,
        goal_id=None,       # текстовая оценка не привязана к конкретной цели в БД
        employee_id=request.employee_id,
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
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

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
    if isinstance(result, dict) and result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result
