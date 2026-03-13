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
    query = select(Goal).options(selectinload(Goal.evaluation)).where(
        Goal.employee_id == employee_id
    )
    if quarter:
        query = query.where(Goal.quarter == quarter)
    if year:
        query = query.where(Goal.year == year)

    result = await db.execute(query)
    goals = result.scalars().all()

    return [
        {
            "id": str(g.id),
            "title": g.title,
            "goal_text": g.goal_text,
            "metric": g.metric,
            "deadline": g.deadline.isoformat() if g.deadline else None,
            "weight": g.weight,
            "status": g.status,
            "quarter": g.quarter,
            "year": g.year,
            "smart_index": g.evaluation.smart_index if g.evaluation else None,
            "goal_type": g.evaluation.goal_type if g.evaluation else None,
        }
        for g in goals
    ]


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
