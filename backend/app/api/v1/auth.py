from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_jwt import create_access_token
from app.database import get_db
from app.models.hr_models import Employee
from app.security import VALID_ROLES, get_actor_context

router = APIRouter(prefix="/auth", tags=["Авторизация"])

HR_KEYWORDS = ("hr", "human resources", "кадр", "персонал")


def _contains_hr_keyword(value: str | None) -> bool:
    if not value:
        return False
    lowered = value.lower()
    return any(keyword in lowered for keyword in HR_KEYWORDS)


async def _fetch_employee(
    db: AsyncSession,
    employee_id: int,
) -> Employee | None:
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.department), selectinload(Employee.position))
        .where(Employee.id == employee_id, Employee.is_active == True)  # noqa: E712
    )
    return result.scalar_one_or_none()


async def _is_manager(db: AsyncSession, employee_id: int) -> bool:
    result = await db.execute(
        select(Employee.id).where(
            Employee.manager_id == employee_id,
            Employee.is_active == True,  # noqa: E712
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


def _is_hr_candidate(employee: Employee) -> bool:
    dept_name = employee.department.name if employee.department else None
    dept_code = employee.department.code if employee.department else None
    position_name = employee.position.name if employee.position else None
    return (
        _contains_hr_keyword(dept_name)
        or _contains_hr_keyword(dept_code)
        or _contains_hr_keyword(position_name)
    )


async def _pick_default_employee_for_role(
    role: str,
    db: AsyncSession,
) -> Employee | None:
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.department), selectinload(Employee.position))
        .where(Employee.is_active == True)  # noqa: E712
        .order_by(Employee.created_at.asc())
    )
    employees = result.scalars().all()
    if not employees:
        return None

    if role == "employee":
        return employees[0]

    if role == "manager":
        for employee in employees:
            if await _is_manager(db, employee.id):
                return employee
        return None

    if role == "hr":
        for employee in employees:
            if _is_hr_candidate(employee):
                return employee
        return None

    return None


def _serialize_candidate(employee: Employee) -> dict:
    return {
        "id": str(employee.id),
        "full_name": employee.full_name,
        "department": employee.department.name if employee.department else None,
        "department_id": employee.department_id,
        "position": employee.position.name if employee.position else None,
        "manager_id": str(employee.manager_id) if employee.manager_id else None,
    }


def _serialize_actor(role: str, employee: Employee | None) -> dict:
    if employee is None:
        return {"role": role, "employee_id": None}
    return {
        "role": role,
        "employee_id": str(employee.id),
        "full_name": employee.full_name,
        "department": employee.department.name if employee.department else None,
        "position": employee.position.name if employee.position else None,
    }


@router.post("/impersonate")
async def impersonate(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    role = str(body.get("role", "hr")).strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Invalid role")

    employee_id_raw = body.get("employee_id")
    employee: Employee | None = None
    if employee_id_raw:
        try:
            employee_id = int(str(employee_id_raw))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid employee_id")
        employee = await _fetch_employee(db, employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
    else:
        employee = await _pick_default_employee_for_role(role, db)

    if role == "manager":
        if employee is None:
            raise HTTPException(status_code=404, detail="No manager employee found")
        if not await _is_manager(db, employee.id):
            raise HTTPException(status_code=403, detail="Employee cannot act as manager")
    elif role == "hr":
        # HR can work without linked employee, but if employee is provided it must be HR-like.
        if employee is not None and not _is_hr_candidate(employee):
            raise HTTPException(status_code=403, detail="Employee cannot act as HR")
    elif role == "employee":
        if employee is None:
            raise HTTPException(status_code=404, detail="No employee found")

    access_token = create_access_token(
        role=role,
        employee_id=employee.id if employee else None,
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "actor": _serialize_actor(role, employee),
    }


@router.get("/options")
async def impersonation_options(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.department), selectinload(Employee.position))
        .where(Employee.is_active == True)  # noqa: E712
        .order_by(Employee.full_name.asc())
    )
    employees = result.scalars().all()

    manager_ids: set[int] = set()
    for employee in employees:
        if employee.manager_id:
            manager_ids.add(employee.manager_id)

    departments = sorted(
        {
            (
                employee.department_id,
                employee.department.name,
            )
            for employee in employees
            if employee.department_id and employee.department and employee.department.name
        },
        key=lambda item: item[1],
    )

    return {
        "roles": {
            "hr": {
                "requires_employee": False,
                "count": 1,
            },
            "manager": {
                "requires_employee": True,
                "count": len(manager_ids),
                "employees": [
                    _serialize_candidate(employee)
                    for employee in employees
                    if employee.id in manager_ids
                ],
            },
            "employee": {
                "requires_employee": True,
                "count": len(employees),
                "employees": [_serialize_candidate(employee) for employee in employees],
            },
        },
        "departments": [
            {"id": department_id, "name": name}
            for department_id, name in departments
        ],
    }


@router.get("/whoami")
async def whoami(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db, require_employee_for_non_hr=False)
    return {
        "actor": _serialize_actor(actor.role, actor.employee),
    }
