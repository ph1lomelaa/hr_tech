from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.analytics_service import get_department_maturity, get_company_dashboard

router = APIRouter(prefix="/analytics", tags=["Аналитика"])


@router.get("/department/{department_id}")
async def department_maturity(
    department_id: UUID,
    quarter: str = Query(default="Q1", pattern="^Q[1-4]$"),
    year: int = Query(default=2026),
    refresh: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    """
    Дашборд зрелости целеполагания одного подразделения.
    """
    return await get_department_maturity(
        department_id=department_id,
        quarter=quarter,
        year=year,
        db=db,
        force_refresh=refresh,
    )


@router.get("/company")
async def company_dashboard(
    quarter: str = Query(default="Q1", pattern="^Q[1-4]$"),
    year: int = Query(default=2026),
    db: AsyncSession = Depends(get_db),
):
    """
    Общий дашборд по всей компании — все подразделения, общие метрики.
    """
    return await get_company_dashboard(quarter=quarter, year=year, db=db)


@router.post("/refresh")
async def refresh_maturity_cache(
    quarter: str = Query(default="Q1"),
    year: int = Query(default=2026),
    db: AsyncSession = Depends(get_db),
):
    """
    Пересчитывает кэш зрелости для всех подразделений.
    """
    from sqlalchemy import select
    from app.models.hr_models import Department

    depts = await db.execute(select(Department).where(Department.is_active == True))  # noqa: E712
    departments = depts.scalars().all()

    results = []
    for dept in departments:
        data = await get_department_maturity(
            department_id=dept.id,
            quarter=quarter,
            year=year,
            db=db,
            force_refresh=True,
        )
        results.append({"department": dept.name, "maturity_index": data.get("maturity_index")})

    return {"refreshed": len(results), "departments": results}
