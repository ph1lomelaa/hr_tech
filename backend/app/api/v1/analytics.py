from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.security import get_actor_context
from app.services.analytics_service import get_department_maturity, get_company_dashboard
from app.utils.goal_fields import normalize_quarter

router = APIRouter(prefix="/analytics", tags=["Аналитика"])


@router.get("/department/{department_id}")
async def department_maturity(
    department_id: int,
    request: Request,
    quarter: str = Query(default="Q1"),
    year: int = Query(default=2026),
    refresh: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    """
    Дашборд зрелости целеполагания одного подразделения.
    """
    actor = await get_actor_context(request, db)
    if actor.role == "employee":
        raise HTTPException(status_code=403, detail="Employees cannot access department analytics")
    if actor.role == "manager":
        if not actor.employee or actor.employee.department_id != department_id:
            raise HTTPException(
                status_code=403,
                detail="Managers can access analytics only for their own department",
            )

    try:
        normalized_quarter = normalize_quarter(quarter, default="Q1")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return await get_department_maturity(
        department_id=department_id,
        quarter=normalized_quarter or "Q1",
        year=year,
        db=db,
        force_refresh=refresh,
    )


@router.get("/company")
async def company_dashboard(
    request: Request,
    quarter: str = Query(default="Q1"),
    year: int = Query(default=2026),
    refresh: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    """
    Общий дашборд по всей компании — все подразделения, общие метрики.
    """
    actor = await get_actor_context(request, db, require_employee_for_non_hr=False)
    if actor.role != "hr":
        raise HTTPException(status_code=403, detail="Only HR can access company dashboard")

    try:
        normalized_quarter = normalize_quarter(quarter, default="Q1")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return await get_company_dashboard(
        quarter=normalized_quarter or "Q1",
        year=year,
        db=db,
        force_refresh=refresh,
    )


@router.post("/refresh")
async def refresh_maturity_cache(
    request: Request,
    quarter: str = Query(default="Q1"),
    year: int = Query(default=2026),
    db: AsyncSession = Depends(get_db),
):
    """
    Пересчитывает кэш зрелости для всех подразделений.
    """
    actor = await get_actor_context(request, db, require_employee_for_non_hr=False)
    if actor.role != "hr":
        raise HTTPException(status_code=403, detail="Only HR can refresh analytics cache")

    from sqlalchemy import select
    from app.models.hr_models import Department

    depts = await db.execute(select(Department).where(Department.is_active == True))  # noqa: E712
    departments = depts.scalars().all()
    try:
        normalized_quarter = normalize_quarter(quarter, default="Q1")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    results = []
    for dept in departments:
        data = await get_department_maturity(
            department_id=dept.id,
            quarter=normalized_quarter or "Q1",
            year=year,
            db=db,
            force_refresh=True,
        )
        results.append({"department": dept.name, "maturity_index": data.get("maturity_index")})

    # Прогреваем и обновляем aggregate cache.
    await get_company_dashboard(
        quarter=normalized_quarter or "Q1",
        year=year,
        db=db,
        force_refresh=True,
    )

    return {"refreshed": len(results), "departments": results}
