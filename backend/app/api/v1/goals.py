"""
Эндпоинты для работы с целями:
  GET  /api/v1/goals         — список всех целей (с фильтрами)
  POST /api/v1/goals         — создать цель
  GET  /api/v1/goals/{id}    — деталь цели
  PATCH /api/v1/goals/{id}/status — обновить статус / комментарий
"""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.hr_models import Goal, Employee

router = APIRouter(prefix="/goals", tags=["Цели"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _serialize_goal(g: Goal) -> dict:
    emp = g.employee
    ev = g.evaluation
    return {
        "id": str(g.id),
        "employee_id": str(g.employee_id),
        "employee_name": emp.full_name if emp else None,
        "position": (
            (emp.position.name if emp and emp.position else None)
            or g.position
            or "Сотрудник"
        ),
        "department": emp.department.name if emp and emp.department else None,
        "title": g.title,
        "goal_text": g.goal_text or g.description or g.title,
        "metric": g.metric,
        "deadline": g.deadline.isoformat() if g.deadline else None,
        "weight": g.weight,
        "status": g.status,
        "reviewer_comment": g.reviewer_comment,
        "quarter": g.quarter,
        "year": g.year,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        # AI-оценка
        "smart_index": ev.smart_index if ev else None,
        "scores": (
            {
                "S": ev.score_s,
                "M": ev.score_m,
                "A": ev.score_a,
                "R": ev.score_r,
                "T": ev.score_t,
            }
            if ev
            else None
        ),
        "goal_type": ev.goal_type if ev else None,
        "alignment_level": ev.alignment_level if ev else None,
        "alignment_source": ev.alignment_source if ev else None,
        "recommendations": ev.recommendations if ev else [],
        "rewrite": ev.rewrite if ev else None,
        "weak_criteria": ev.weak_criteria if ev else [],
    }


def _goal_query():
    return select(Goal).options(
        selectinload(Goal.evaluation),
        selectinload(Goal.employee).selectinload(Employee.position),
        selectinload(Goal.employee).selectinload(Employee.department),
    )


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/")
async def list_goals(
    status: str | None = Query(default=None, description="Фильтр по статусу"),
    quarter: str | None = Query(default=None, description="Q1–Q4"),
    year: int | None = Query(default=None),
    employee_id: UUID | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Список всех целей с опциональными фильтрами."""
    query = _goal_query().order_by(Goal.created_at.desc()).limit(limit)

    if status:
        query = query.where(Goal.status == status)
    if quarter:
        query = query.where(Goal.quarter == quarter)
    if year:
        query = query.where(Goal.year == year)
    if employee_id:
        query = query.where(Goal.employee_id == employee_id)

    result = await db.execute(query)
    return [_serialize_goal(g) for g in result.scalars().all()]


@router.post("/", status_code=201)
async def create_goal(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Создать новую цель."""
    try:
        emp_id = UUID(str(body["employee_id"]))
    except (KeyError, ValueError):
        raise HTTPException(status_code=422, detail="employee_id is required and must be a valid UUID")

    goal_text = body.get("goal_text") or body.get("title") or ""

    goal = Goal(
        employee_id=emp_id,
        title=goal_text[:255] if goal_text else "Цель",
        goal_text=goal_text,
        description=goal_text,
        metric=body.get("metric"),
        weight=body.get("weight"),
        status=body.get("status", "draft"),
        quarter=body.get("quarter"),
        year=int(body.get("year", 2026)),
        reviewer_comment=body.get("reviewer_comment"),
    )
    if body.get("deadline"):
        try:
            goal.deadline = date.fromisoformat(body["deadline"])
        except (ValueError, TypeError):
            pass

    db.add(goal)
    await db.commit()
    await db.refresh(goal)

    # Автоматически загружаем связи для ответа
    result = await db.execute(_goal_query().where(Goal.id == goal.id))
    created = result.scalar_one()
    return _serialize_goal(created)


@router.get("/{goal_id}")
async def get_goal(
    goal_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Деталь цели по ID."""
    result = await db.execute(_goal_query().where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return _serialize_goal(goal)


@router.patch("/{goal_id}/status")
async def update_goal_status(
    goal_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Обновить статус цели (утвердить / отклонить) и добавить комментарий."""
    goal = await db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    if "status" in body:
        goal.status = body["status"]
    if "reviewer_comment" in body:
        goal.reviewer_comment = body["reviewer_comment"]

    await db.commit()
    return {"ok": True, "goal_id": str(goal_id), "status": goal.status}
