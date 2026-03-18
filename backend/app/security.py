from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_jwt import TokenValidationError, decode_access_token
from app.config import settings
from app.models.hr_models import Employee

VALID_ROLES = {"hr", "manager", "employee"}


@dataclass
class ActorContext:
    role: str
    employee_id: int | None
    employee: Employee | None


async def get_actor_context(
    request: Request,
    db: AsyncSession,
    *,
    require_employee_for_non_hr: bool = True,
) -> ActorContext:
    role: str | None = None
    employee_id: int | None = None
    employee: Employee | None = None

    auth_header = request.headers.get("Authorization") or ""
    token = ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()

    if token:
        try:
            claims = decode_access_token(token)
        except TokenValidationError as exc:
            raise HTTPException(status_code=401, detail=f"Invalid access token: {exc}") from exc
        role = claims.role
        employee_id = claims.employee_id
    elif settings.auth_allow_header_fallback:
        role = (request.headers.get("X-Role") or "hr").strip().lower()
        employee_id_raw = request.headers.get("X-Employee-Id")
        if employee_id_raw:
            try:
                employee_id = int(employee_id_raw)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid X-Employee-Id header")
    else:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    if role not in VALID_ROLES:
        raise HTTPException(status_code=401, detail="Invalid role in auth context")

    if employee_id:
        employee = await db.get(Employee, employee_id)
        if not employee:
            raise HTTPException(status_code=401, detail="Actor employee not found")

    if role in {"employee", "manager"} and require_employee_for_non_hr and employee_id is None:
        raise HTTPException(status_code=401, detail="employee_id is required for this role")

    return ActorContext(role=role, employee_id=employee_id, employee=employee)


async def get_direct_report_ids(manager_id: int, db: AsyncSession) -> list[int]:
    result = await db.execute(
        select(Employee.id).where(
            Employee.manager_id == manager_id,
            Employee.is_active == True,  # noqa: E712
        )
    )
    return [row[0] for row in result.fetchall()]


async def can_access_employee(
    actor: ActorContext,
    target_employee_id: int,
    db: AsyncSession,
    *,
    allow_reports_for_manager: bool = True,
) -> bool:
    if actor.role == "hr":
        return True

    if actor.employee_id is None:
        return False

    if actor.employee_id == target_employee_id:
        return True

    if actor.role == "manager" and allow_reports_for_manager:
        report_ids = await get_direct_report_ids(actor.employee_id, db)
        return target_employee_id in report_ids

    return False


async def ensure_employee_access(
    actor: ActorContext,
    target_employee_id: int,
    db: AsyncSession,
    *,
    allow_reports_for_manager: bool = True,
    detail: str = "Forbidden",
) -> None:
    allowed = await can_access_employee(
        actor=actor,
        target_employee_id=target_employee_id,
        db=db,
        allow_reports_for_manager=allow_reports_for_manager,
    )
    if not allowed:
        raise HTTPException(status_code=403, detail=detail)
