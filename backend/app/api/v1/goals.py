"""
Эндпоинты для работы с целями:
  GET  /api/v1/goals         — список всех целей (с фильтрами)
  POST /api/v1/goals         — создать цель
  GET  /api/v1/goals/{id}    — деталь цели
  PATCH /api/v1/goals/{id}/status — обновить статус / комментарий
"""
import logging
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.ai_models import GoalAlert, SuggestedGoal
from app.models.hr_models import Employee, Goal, GoalEvent, GoalReview
from app.security import (
    can_access_employee,
    ensure_employee_access,
    get_actor_context,
    get_direct_report_ids,
)
from app.services.goal_quality_rules import (
    create_alert_if_absent,
    find_goal_duplicates,
    validate_goal_set_constraints,
)
from app.utils.goal_fields import (
    legacy_status_code,
    normalize_goal_status,
    normalize_quarter,
    status_label_ru,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/goals", tags=["Цели"])

_APPROVED_LIKE_STATUSES = {"approved", "active", "in_progress", "done"}
_REJECTED_LIKE_STATUSES = {"cancelled", "overdue", "archived"}


def _latest_goal_review(goal: Goal) -> GoalReview | None:
    if not getattr(goal, "reviews", None):
        return None
    return max(goal.reviews, key=lambda item: item.created_at or 0)


def _serialize_goal(g: Goal) -> dict:
    emp = g.employee
    ev = g.evaluation
    source = g.source_info
    review = _latest_goal_review(g)
    status_code = g.status
    return {
        "id": str(g.id),
        "employee_id": str(g.employee_id),
        "employee_name": emp.full_name if emp else g.employee_name_snapshot,
        "position": (
            (emp.position.name if emp and emp.position else None)
            or g.position
            or "Сотрудник"
        ),
        "department": (
            (emp.department.name if emp and emp.department else None)
            or g.department_name_snapshot
        ),
        "title": (g.goal_text or "Цель")[:255],
        "goal_text": g.goal_text,
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


def _goal_query():
    return select(Goal).options(
        selectinload(Goal.evaluation),
        selectinload(Goal.source_info),
        selectinload(Goal.reviews),
        selectinload(Goal.employee).selectinload(Employee.position),
        selectinload(Goal.employee).selectinload(Employee.department),
    )


@router.get("/")
async def list_goals(
    request: Request,
    status: str | None = Query(default=None, description="Legacy фильтр по статусу"),
    status_code: str | None = Query(default=None, description="Фильтр по реальному status_code"),
    quarter: str | None = Query(default=None, description="Q1–Q4"),
    year: int | None = Query(default=None),
    employee_id: int | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    query = _goal_query().order_by(Goal.created_at.desc()).limit(limit)

    if actor.role == "employee":
        query = query.where(Goal.employee_id == actor.employee_id)
    elif actor.role == "manager":
        report_ids = await get_direct_report_ids(actor.employee_id, db)
        allowed_ids = [actor.employee_id, *report_ids]
        query = query.where(Goal.employee_id.in_(allowed_ids))

    status_filter = status_code or status
    if status_filter:
        try:
            normalized_status = normalize_goal_status(status_filter)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

        lowered = str(status_filter).strip().lower().replace("-", "_")
        if not status_code and lowered in {"approved", "утверждена"}:
            query = query.where(Goal.status.in_(_APPROVED_LIKE_STATUSES))
        elif not status_code and lowered in {"rejected", "отклонена"}:
            query = query.where(Goal.status.in_(_REJECTED_LIKE_STATUSES))
        else:
            query = query.where(Goal.status == normalized_status)

    if quarter:
        try:
            normalized_quarter = normalize_quarter(quarter)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        query = query.where(Goal.quarter == normalized_quarter)
    if year:
        query = query.where(Goal.year == year)
    if employee_id:
        query = query.where(Goal.employee_id == employee_id)

    result = await db.execute(query)
    return [_serialize_goal(g) for g in result.scalars().all()]


@router.post("/", status_code=201)
async def create_goal(
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    try:
        emp_id = int(str(body["employee_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=422, detail="employee_id is required and must be an integer")

    try:
        new_status = normalize_goal_status(
            body.get("status_code", body.get("status")),
            default="draft",
        ) or "draft"
        new_quarter = normalize_quarter(body.get("quarter"))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if new_quarter is None:
        raise HTTPException(status_code=422, detail="quarter is required")

    goal_text = str(body.get("goal_text") or body.get("title") or "").strip()
    if not goal_text:
        raise HTTPException(status_code=422, detail="goal_text is required")

    try:
        year_value = int(body.get("year", 2026))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="year must be an integer")

    employee_result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.department))
        .where(Employee.id == emp_id)
    )
    employee = employee_result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await ensure_employee_access(
        actor=actor,
        target_employee_id=emp_id,
        db=db,
        detail="You cannot create goals for this employee",
    )

    resolved_position = body.get("position")
    if not resolved_position and employee.position:
        resolved_position = employee.position.name

    goal = Goal(
        employee_id=emp_id,
        department_id=employee.department_id,
        employee_name_snapshot=employee.full_name,
        position=resolved_position,
        department_name_snapshot=employee.department.name if employee.department else None,
        goal_text=goal_text,
        metric=body.get("metric"),
        weight=body.get("weight") or 1.0,
        status=new_status,
        quarter=new_quarter,
        year=year_value,
    )
    if body.get("deadline"):
        try:
            goal.deadline = date.fromisoformat(str(body["deadline"]))
        except (ValueError, TypeError):
            pass

    db.add(goal)
    await db.flush()

    event_type = "submitted" if new_status == "submitted" else "created"
    db.add(
        GoalEvent(
            goal_id=goal.id,
            event_type=event_type,
            actor_id=actor.employee_id,
            old_status=None,
            new_status=goal.status,
            old_text=None,
            new_text=goal.goal_text,
            metadata_={
                "quarter": goal.quarter,
                "year": goal.year,
                "weight": goal.weight,
                "metric": goal.metric,
            },
        )
    )

    await db.commit()

    from app.services.smart_evaluator import evaluate_goal as _evaluate_goal

    eval_position = resolved_position or (
        employee.position.name if employee.position else "Сотрудник"
    )
    eval_department = employee.department.name if employee.department else "Подразделение"
    try:
        await _evaluate_goal(
            goal_text=goal.goal_text,
            position=eval_position,
            department=eval_department,
            goal_id=goal.id,
            employee_id=emp_id,
            quarter=goal.quarter,
            year=goal.year,
            db=db,
        )
    except Exception as exc:
        logger.warning("Auto-evaluation failed for goal %s: %s", goal.id, exc)

    result = await db.execute(_goal_query().where(Goal.id == goal.id))
    created = result.scalar_one()
    payload = _serialize_goal(created)

    duplicate_matches = await find_goal_duplicates(
        goal_text=goal.goal_text,
        employee_id=goal.employee_id,
        quarter=goal.quarter,
        year=goal.year,
        db=db,
        exclude_goal_id=goal.id,
    )
    duplicate_warnings: list[str] = []
    if duplicate_matches:
        duplicate_warning = "Цель похожа на существующие цели сотрудника/подразделения."
        duplicate_warnings.append(duplicate_warning)
        await create_alert_if_absent(
            db=db,
            employee_id=goal.employee_id,
            goal_id=goal.id,
            alert_type="duplicate_goal",
            severity="warning",
            message=duplicate_warning,
            notify_manager=True,
        )

    set_checks = await validate_goal_set_constraints(
        employee_id=goal.employee_id,
        quarter=goal.quarter,
        year=goal.year,
        db=db,
    )

    payload["set_warnings"] = set_checks["warnings"]
    payload["duplicate_warnings"] = duplicate_warnings
    payload["duplicate_count"] = len(duplicate_matches)
    return payload


@router.get("/{goal_id}")
async def get_goal(
    goal_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    result = await db.execute(_goal_query().where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    await ensure_employee_access(
        actor=actor,
        target_employee_id=goal.employee_id,
        db=db,
        detail="You cannot view this goal",
    )
    return _serialize_goal(goal)


@router.patch("/{goal_id}/status")
async def update_goal_status(
    goal_id: UUID,
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    goal = await db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    await ensure_employee_access(
        actor=actor,
        target_employee_id=goal.employee_id,
        db=db,
        detail="You cannot update this goal",
    )

    old_status = goal.status
    old_text = goal.goal_text
    status_input = body.get("status_code", body.get("status"))
    reviewer_comment = str(body.get("reviewer_comment") or "").strip()

    review_to_add: GoalReview | None = None
    event_type: str | None = None

    if status_input is not None:
        raw_action = str(status_input).strip().lower().replace("-", "_")
        rejection_action = raw_action in {"rejected", "cancelled", "needs_changes"}

        if rejection_action:
            if goal.status != "submitted":
                raise HTTPException(
                    status_code=409,
                    detail="Only submitted goals can be sent back for rework",
                )
            if actor.role == "employee":
                raise HTTPException(status_code=403, detail="Employees cannot reject goals")
            if actor.role == "manager":
                if actor.employee_id is None or actor.employee_id == goal.employee_id:
                    raise HTTPException(status_code=403, detail="Managers cannot reject their own goals")
                is_direct_report = await can_access_employee(
                    actor=actor,
                    target_employee_id=goal.employee_id,
                    db=db,
                    allow_reports_for_manager=True,
                )
                if not is_direct_report:
                    raise HTTPException(
                        status_code=403,
                        detail="Managers can reject only direct reports' goals",
                    )

            goal.status = "draft"
            review_to_add = GoalReview(
                goal_id=goal.id,
                reviewer_id=actor.employee_id,
                verdict="needs_changes",
                comment_text=reviewer_comment or "Цель возвращена на доработку",
            )
            event_type = "rejected"
        else:
            try:
                normalized_status = normalize_goal_status(status_input, default=goal.status) or goal.status
            except ValueError as e:
                raise HTTPException(status_code=422, detail=str(e))

            if normalized_status == "approved":
                if goal.status != "submitted":
                    raise HTTPException(
                        status_code=409,
                        detail="Only submitted goals can be approved",
                    )
                if actor.role == "employee":
                    raise HTTPException(status_code=403, detail="Employees cannot approve goals")
                if actor.role == "manager":
                    if actor.employee_id is None or actor.employee_id == goal.employee_id:
                        raise HTTPException(status_code=403, detail="Managers cannot approve their own goals")
                    is_direct_report = await can_access_employee(
                        actor=actor,
                        target_employee_id=goal.employee_id,
                        db=db,
                        allow_reports_for_manager=True,
                    )
                    if not is_direct_report:
                        raise HTTPException(
                            status_code=403,
                            detail="Managers can approve only direct reports' goals",
                        )

                goal.status = "approved"
                review_to_add = GoalReview(
                    goal_id=goal.id,
                    reviewer_id=actor.employee_id,
                    verdict="approve",
                    comment_text=reviewer_comment or "Цель утверждена",
                )
                event_type = "approved"
            else:
                goal.status = normalized_status
                if reviewer_comment and actor.role != "employee":
                    review_to_add = GoalReview(
                        goal_id=goal.id,
                        reviewer_id=actor.employee_id,
                        verdict="comment_only",
                        comment_text=reviewer_comment,
                    )
                    event_type = "commented"

                if event_type is None and old_status != goal.status:
                    if goal.status == "submitted":
                        event_type = "submitted"
                    else:
                        event_type = "status_changed"

    elif reviewer_comment:
        review_to_add = GoalReview(
            goal_id=goal.id,
            reviewer_id=actor.employee_id,
            verdict="comment_only",
            comment_text=reviewer_comment,
        )
        event_type = "commented"

    if review_to_add:
        db.add(review_to_add)

    if event_type:
        db.add(
            GoalEvent(
                goal_id=goal.id,
                event_type=event_type,
                actor_id=actor.employee_id,
                old_status=old_status,
                new_status=goal.status,
                old_text=old_text,
                new_text=goal.goal_text,
                metadata_={"reviewer_comment": reviewer_comment or None},
            )
        )

    await db.commit()

    result = await db.execute(_goal_query().where(Goal.id == goal_id))
    updated = result.scalar_one_or_none()
    if not updated:
        raise HTTPException(status_code=404, detail="Goal not found")
    return _serialize_goal(updated)


@router.get("/{goal_id}/events")
async def get_goal_events(
    goal_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    goal = await db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    await ensure_employee_access(
        actor=actor,
        target_employee_id=goal.employee_id,
        db=db,
        detail="You cannot view this goal",
    )
    result = await db.execute(
        select(GoalEvent)
        .where(GoalEvent.goal_id == goal_id)
        .order_by(GoalEvent.created_at.asc())
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "old_status": e.old_status,
            "new_status": e.new_status,
            "old_text": e.old_text,
            "new_text": e.new_text,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(
    goal_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    goal = await db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    await ensure_employee_access(
        actor=actor,
        target_employee_id=goal.employee_id,
        db=db,
        detail="You cannot delete this goal",
    )

    if actor.role != "hr" and actor.employee_id != goal.employee_id:
        raise HTTPException(
            status_code=403,
            detail="Only goal owner or HR can delete draft goals",
        )

    if goal.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Only draft goals can be deleted",
        )

    alerts_result = await db.execute(select(GoalAlert).where(GoalAlert.goal_id == goal_id))
    for alert in alerts_result.scalars().all():
        alert.goal_id = None

    suggested_result = await db.execute(
        select(SuggestedGoal).where(SuggestedGoal.accepted_goal_id == goal_id)
    )
    for sg in suggested_result.scalars().all():
        sg.accepted_goal_id = None

    await db.delete(goal)
    await db.commit()
    return Response(status_code=204)
