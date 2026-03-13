from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.generation import (
    GenerateGoalsRequest,
    GenerateGoalsResponse,
    AcceptGoalRequest,
    AcceptGoalResponse,
    RewriteGoalRequest,
    RewriteGoalResponse,
)
from app.services.goal_generator import generate_goals, accept_suggested_goal, rewrite_goal

router = APIRouter(prefix="/generate", tags=["Генерация целей"])


@router.post("/goals", response_model=GenerateGoalsResponse)
async def generate_employee_goals(
    request: GenerateGoalsRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Генерация 3-5 целей на основе должности, ВНД и целей руководителя.
    """
    try:
        return await generate_goals(
            employee_id=request.employee_id,
            quarter=request.quarter,
            year=request.year,
            focus_direction=request.focus_direction,
            include_manager_goals=request.include_manager_goals,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/accept", response_model=AcceptGoalResponse)
async def accept_goal(
    request: AcceptGoalRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Сотрудник принимает сгенерированную цель → цель создаётся в системе.
    """
    try:
        goal_id = await accept_suggested_goal(
            suggested_goal_id=request.suggested_goal_id,
            employee_id=request.employee_id,
            weight=request.weight,
            db=db,
        )
        return AcceptGoalResponse(goal_id=goal_id, message="Цель добавлена в ваш набор")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/rewrite", response_model=RewriteGoalResponse)
async def rewrite_goal_endpoint(
    request: RewriteGoalRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Переформулировка слабой цели. AI улучшает формулировку по слабым критериям.
    """
    return await rewrite_goal(
        goal_text=request.goal_text,
        position=request.position or "Сотрудник",
        department=request.department or "Подразделение",
        weak_criteria=request.weak_criteria,
        db=db,
    )
