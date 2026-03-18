from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_guardrails import enforce_ai_rate_limit, run_with_ai_concurrency_guard
from app.database import get_db
from app.security import ensure_employee_access, get_actor_context
from app.schemas.generation import (
    GenerateGoalsRequest,
    GenerateGoalsResponse,
    AcceptGoalRequest,
    AcceptGoalResponse,
    RejectGoalRequest,
    RejectGoalResponse,
    RewriteGoalRequest,
    RewriteGoalResponse,
)
from app.services.goal_generator import (
    accept_suggested_goal,
    generate_goals,
    reject_suggested_goal,
    rewrite_goal,
)

router = APIRouter(prefix="/generate", tags=["Генерация целей"])


@router.post("/goals", response_model=GenerateGoalsResponse)
async def generate_employee_goals(
    request: GenerateGoalsRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Генерация 3-5 целей на основе должности, ВНД и целей руководителя.
    """
    actor = await get_actor_context(http_request, db)
    await enforce_ai_rate_limit(actor, bucket="generate")
    await ensure_employee_access(
        actor=actor,
        target_employee_id=request.employee_id,
        db=db,
        detail="You cannot generate goals for this employee",
    )

    try:
        return await run_with_ai_concurrency_guard(
            bucket="generate",
            operation=lambda: generate_goals(
                employee_id=request.employee_id,
                quarter=request.quarter,
                year=request.year,
                focus_direction=request.focus_direction,
                include_manager_goals=request.include_manager_goals,
                db=db,
            ),
        )
    except ValueError as e:
        detail = str(e)
        status_code = 404 if "not found" in detail.lower() else 422
        raise HTTPException(status_code=status_code, detail=detail)


@router.post("/accept", response_model=AcceptGoalResponse)
async def accept_goal(
    request: AcceptGoalRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Сотрудник принимает сгенерированную цель → цель создаётся в системе.
    """
    actor = await get_actor_context(http_request, db)
    await ensure_employee_access(
        actor=actor,
        target_employee_id=request.employee_id,
        db=db,
        detail="You cannot accept goals for this employee",
    )

    try:
        goal_id, warnings = await accept_suggested_goal(
            suggested_goal_id=request.suggested_goal_id,
            employee_id=request.employee_id,
            weight=request.weight,
            db=db,
        )
        return AcceptGoalResponse(
            goal_id=goal_id,
            message="Цель добавлена в ваш набор",
            warnings=warnings,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/rewrite", response_model=RewriteGoalResponse)
async def rewrite_goal_endpoint(
    request: RewriteGoalRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Переформулировка слабой цели. AI улучшает формулировку по слабым критериям.
    """
    actor = await get_actor_context(http_request, db, require_employee_for_non_hr=False)
    await enforce_ai_rate_limit(actor, bucket="evaluate")
    return await run_with_ai_concurrency_guard(
        bucket="evaluate",
        operation=lambda: rewrite_goal(
            goal_text=request.goal_text,
            position=request.position or "Сотрудник",
            department=request.department or "Подразделение",
            weak_criteria=request.weak_criteria,
            db=db,
        ),
    )


@router.post("/reject", response_model=RejectGoalResponse)
async def reject_goal(
    request: RejectGoalRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(http_request, db)
    await ensure_employee_access(
        actor=actor,
        target_employee_id=request.employee_id,
        db=db,
        detail="You cannot reject goals for this employee",
    )

    try:
        suggested_goal_id = await reject_suggested_goal(
            suggested_goal_id=request.suggested_goal_id,
            employee_id=request.employee_id,
            reason=request.reason,
            db=db,
        )
        return RejectGoalResponse(
            suggested_goal_id=suggested_goal_id,
            message="Сгенерированная цель отклонена",
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
