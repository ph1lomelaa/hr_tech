from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.hr_models import Employee, Goal
from app.models.ai_models import GoalAlert
from app.security import ensure_employee_access, get_actor_context
from app.utils.goal_fields import legacy_status_code, normalize_quarter, status_label_ru

router = APIRouter(prefix="/employees", tags=["Сотрудники"])


def _latest_goal_review(goal: Goal):
    if not getattr(goal, "reviews", None):
        return None
    return max(goal.reviews, key=lambda item: item.created_at or 0)


@router.get("/{employee_id}")
async def get_employee(
    employee_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    await ensure_employee_access(
        actor=actor,
        target_employee_id=employee_id,
        db=db,
        detail="You cannot access this employee",
    )

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
    request: Request,
    department_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    query = select(Employee).options(
        selectinload(Employee.position),
        selectinload(Employee.department),
    ).where(Employee.is_active == True)  # noqa: E712

    if actor.role == "employee":
        if actor.employee and actor.employee.manager_id:
            query = query.where(
                or_(
                    Employee.id == actor.employee_id,
                    Employee.id == actor.employee.manager_id,
                )
            )
        else:
            query = query.where(Employee.id == actor.employee_id)
    elif actor.role == "manager":
        query = query.where(
            or_(
                Employee.id == actor.employee_id,
                Employee.manager_id == actor.employee_id,
            )
        )

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
            "manager_id": str(e.manager_id) if e.manager_id else None,
        }
        for e in employees
    ]


@router.get("/{employee_id}/goals")
async def get_employee_goals(
    employee_id: int,
    request: Request,
    quarter: str | None = Query(default=None),
    year: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    await ensure_employee_access(
        actor=actor,
        target_employee_id=employee_id,
        db=db,
        detail="You cannot access this employee goals",
    )

    query = select(Goal).options(
        selectinload(Goal.evaluation),
        selectinload(Goal.source_info),
        selectinload(Goal.reviews),
        selectinload(Goal.employee).selectinload(Employee.position),
        selectinload(Goal.employee).selectinload(Employee.department),
    ).where(Goal.employee_id == employee_id)
    if quarter:
        try:
            normalized_quarter = normalize_quarter(quarter)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        query = query.where(Goal.quarter == normalized_quarter)
    if year:
        query = query.where(Goal.year == year)

    result = await db.execute(query)
    goals = result.scalars().all()

    payload = []
    for g in goals:
        emp = g.employee
        ev = g.evaluation
        source = g.source_info
        review = _latest_goal_review(g)
        status_code = g.status
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
                "status": legacy_status_code(status_code, review.verdict if review else None),
                "status_code": status_code,
                "status_label_ru": status_label_ru(status_code),
                "reviewer_comment": review.comment_text if review else None,
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
                "source_doc_id": str(source.source_doc_id) if source and source.source_doc_id else None,
                "source_doc_title": source.source_doc_title if source else None,
                "source_quote": source.source_quote if source else None,
                "generation_context": source.generation_context if source else None,
                "suggested_goal_id": str(source.suggested_goal_id) if source and source.suggested_goal_id else None,
                "generation_session_id": str(source.generation_session_id) if source and source.generation_session_id else None,
            }
        )
    return payload


@router.get("/{employee_id}/manager-goals")
async def get_manager_goals(
    employee_id: int,
    request: Request,
    quarter: str = Query(default="Q1"),
    year: int = Query(default=2026),
    db: AsyncSession = Depends(get_db),
):
    """
    Цели руководителя данного сотрудника — для каскадирования.
    """
    actor = await get_actor_context(request, db)
    employee = await db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await ensure_employee_access(
        actor=actor,
        target_employee_id=employee_id,
        db=db,
        detail="You cannot access manager goals for this employee",
    )

    if not employee.manager_id:
        return []
    try:
        normalized_quarter = normalize_quarter(quarter, default="Q1")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    result = await db.execute(
        select(Goal).where(
            Goal.employee_id == employee.manager_id,
            Goal.quarter == normalized_quarter,
            Goal.year == year,
            Goal.status != "draft",
        )
    )
    goals = result.scalars().all()

    return [
        {
            "id": str(g.id),
            "goal_text": g.goal_text or g.title,
            "weight": g.weight,
            "status": legacy_status_code(g.status),
            "status_code": g.status,
            "status_label_ru": status_label_ru(g.status),
        }
        for g in goals
    ]


@router.get("/{employee_id}/alerts")
async def get_employee_alerts(
    employee_id: int,
    request: Request,
    unread_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    await ensure_employee_access(
        actor=actor,
        target_employee_id=employee_id,
        db=db,
        allow_reports_for_manager=False,
        detail="You cannot access alerts for this employee",
    )

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
    employee_id: int,
    alert_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    await ensure_employee_access(
        actor=actor,
        target_employee_id=employee_id,
        db=db,
        allow_reports_for_manager=False,
        detail="You cannot update alerts for this employee",
    )

    alert = await db.get(GoalAlert, alert_id)
    if not alert or alert.employee_id != employee_id:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    await db.commit()
    return {"ok": True}
