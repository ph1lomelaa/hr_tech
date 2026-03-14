from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.hr_models import Employee, Goal
from app.models.ai_models import GoalAlert

router = APIRouter(prefix="/employees", tags=["Сотрудники"])


@router.get("/{employee_id}")
async def get_employee(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.department))
        .where(Employee.id == employee_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    return {
        "id": str(employee.id),
        "full_name": employee.full_name,
        "email": employee.email,
        "position": employee.position.name if employee.position else None,
        "department": employee.department.name if employee.department else None,
        "manager_id": str(employee.manager_id) if employee.manager_id else None,
    }


@router.get("/")
async def list_employees(
    department_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Employee).options(
        selectinload(Employee.position),
        selectinload(Employee.department),
    ).where(Employee.is_active == True)  # noqa: E712

    if department_id:
        query = query.where(Employee.department_id == department_id)

    result = await db.execute(query)
    employees = result.scalars().all()

    return [
        {
            "id": str(e.id),
            "full_name": e.full_name,
            "position": e.position.name if e.position else None,
            "department": e.department.name if e.department else None,
        }
        for e in employees
    ]


@router.get("/{employee_id}/goals")
async def get_employee_goals(
    employee_id: UUID,
    quarter: str | None = Query(default=None),
    year: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Goal).options(
        selectinload(Goal.evaluation),
        selectinload(Goal.employee).selectinload(Employee.position),
        selectinload(Goal.employee).selectinload(Employee.department),
    ).where(Goal.employee_id == employee_id)
    if quarter:
        query = query.where(Goal.quarter == quarter)
    if year:
        query = query.where(Goal.year == year)

    result = await db.execute(query)
    goals = result.scalars().all()

    payload = []
    for g in goals:
        emp = g.employee
        ev = g.evaluation
        payload.append(
            {
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
        )
    return payload


@router.get("/{employee_id}/manager-goals")
async def get_manager_goals(
    employee_id: UUID,
    quarter: str = Query(default="Q1"),
    year: int = Query(default=2026),
    db: AsyncSession = Depends(get_db),
):
    """
    Цели руководителя данного сотрудника — для каскадирования.
    """
    employee = await db.get(Employee, employee_id)
    if not employee or not employee.manager_id:
        return []

    result = await db.execute(
        select(Goal).where(
            Goal.employee_id == employee.manager_id,
            Goal.quarter == quarter,
            Goal.year == year,
        )
    )
    goals = result.scalars().all()

    return [
        {
            "id": str(g.id),
            "goal_text": g.goal_text or g.title,
            "weight": g.weight,
            "status": g.status,
        }
        for g in goals
    ]


@router.get("/{employee_id}/alerts")
async def get_employee_alerts(
    employee_id: UUID,
    unread_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    query = select(GoalAlert).where(GoalAlert.employee_id == employee_id)
    if unread_only:
        query = query.where(GoalAlert.is_read == False)  # noqa: E712
    query = query.order_by(GoalAlert.created_at.desc())

    result = await db.execute(query)
    alerts = result.scalars().all()

    return [
        {
            "id": str(a.id),
            "alert_type": a.alert_type,
            "severity": a.severity,
            "message": a.message,
            "is_read": a.is_read,
            "created_at": a.created_at.isoformat(),
        }
        for a in alerts
    ]


@router.patch("/{employee_id}/alerts/{alert_id}/read")
async def mark_alert_read(
    employee_id: UUID,
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    alert = await db.get(GoalAlert, alert_id)
    if not alert or alert.employee_id != employee_id:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    await db.commit()
    return {"ok": True}
