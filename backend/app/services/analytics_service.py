import uuid
import logging
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr_models import Department, Employee, Goal
from app.models.ai_models import DepartmentMaturityCache, SmartEvaluation

logger = logging.getLogger(__name__)


async def get_department_maturity(
    department_id: uuid.UUID,
    quarter: str,
    year: int,
    db: AsyncSession,
    force_refresh: bool = False,
) -> dict:
    # Проверяем кэш
    if not force_refresh:
        cached = await db.execute(
            select(DepartmentMaturityCache).where(
                DepartmentMaturityCache.department_id == department_id,
                DepartmentMaturityCache.quarter == quarter,
                DepartmentMaturityCache.year == year,
            )
        )
        cache = cached.scalar_one_or_none()
        if cache:
            dept = await db.get(Department, department_id)
            return _format_maturity(cache, dept.name if dept else "")

    return await _compute_department_maturity(department_id, quarter, year, db)


async def _compute_department_maturity(
    department_id: uuid.UUID,
    quarter: str,
    year: int,
    db: AsyncSession,
) -> dict:
    dept = await db.get(Department, department_id)
    if not dept:
        raise ValueError(f"Department {department_id} not found")

    # Сотрудники подразделения
    emp_result = await db.execute(
        select(Employee.id).where(
            Employee.department_id == department_id,
            Employee.is_active == True,  # noqa: E712
        )
    )
    employee_ids = [row[0] for row in emp_result.fetchall()]

    if not employee_ids:
        return _empty_maturity(department_id, dept.name, quarter, year)

    # Цели за квартал
    goals_result = await db.execute(
        select(Goal)
        .options(selectinload(Goal.evaluation))
        .where(
            Goal.employee_id.in_(employee_ids),
            Goal.quarter == quarter,
            Goal.year == year,
        )
    )
    goals = goals_result.scalars().all()

    if not goals:
        return _empty_maturity(department_id, dept.name, quarter, year)

    # Агрегируем оценки
    evaluations = [g.evaluation for g in goals if g.evaluation]

    if not evaluations:
        return _empty_maturity(department_id, dept.name, quarter, year)

    avg_smart = round(sum(e.smart_index for e in evaluations) / len(evaluations), 2)

    # Средние по каждому критерию
    weak_criteria = {
        "S": round(sum(e.score_s for e in evaluations) / len(evaluations), 2),
        "M": round(sum(e.score_m for e in evaluations) / len(evaluations), 2),
        "A": round(sum(e.score_a for e in evaluations) / len(evaluations), 2),
        "R": round(sum(e.score_r for e in evaluations) / len(evaluations), 2),
        "T": round(sum(e.score_t for e in evaluations) / len(evaluations), 2),
    }

    # Типы целей
    goal_types = {}
    for e in evaluations:
        gt = e.goal_type or "output"
        goal_types[gt] = goal_types.get(gt, 0) + 1

    # Стратегическая связка
    strategic_count = sum(1 for e in evaluations if e.alignment_level == "strategic")
    strategic_percent = round(strategic_count / len(evaluations) * 100, 1)

    # Индекс зрелости = среднее из avg_smart + strategic_percent/100
    maturity_index = round((avg_smart + strategic_percent / 100) / 2, 2)

    # Рекомендации
    recommendations = _generate_recommendations(weak_criteria, goal_types, strategic_percent)

    # Сохраняем в кэш
    existing = await db.execute(
        select(DepartmentMaturityCache).where(
            DepartmentMaturityCache.department_id == department_id,
            DepartmentMaturityCache.quarter == quarter,
            DepartmentMaturityCache.year == year,
        )
    )
    cache = existing.scalar_one_or_none()
    if cache:
        cache.maturity_index = maturity_index
        cache.avg_smart = avg_smart
        cache.strategic_percent = strategic_percent
        cache.total_goals = len(goals)
        cache.weak_criteria = weak_criteria
        cache.goal_type_dist = goal_types
        cache.recommendations = recommendations
    else:
        cache = DepartmentMaturityCache(
            department_id=department_id,
            quarter=quarter,
            year=year,
            maturity_index=maturity_index,
            avg_smart=avg_smart,
            strategic_percent=strategic_percent,
            total_goals=len(goals),
            weak_criteria=weak_criteria,
            goal_type_dist=goal_types,
            recommendations=recommendations,
        )
        db.add(cache)

    await db.commit()

    return {
        "department_id": str(department_id),
        "department_name": dept.name,
        "quarter": quarter,
        "year": year,
        "maturity_index": maturity_index,
        "avg_smart": avg_smart,
        "strategic_percent": strategic_percent,
        "total_goals": len(goals),
        "weak_criteria": weak_criteria,
        "goal_type_dist": goal_types,
        "recommendations": recommendations,
    }


async def get_company_dashboard(quarter: str, year: int, db: AsyncSession) -> dict:
    depts_result = await db.execute(
        select(Department).where(Department.is_active == True)  # noqa: E712
    )
    departments = depts_result.scalars().all()

    dept_data = []
    for dept in departments:
        try:
            data = await get_department_maturity(dept.id, quarter, year, db)
            dept_data.append(data)
        except Exception as e:
            logger.warning(f"Failed to compute maturity for {dept.name}: {e}")

    total_goals = sum(d.get("total_goals", 0) for d in dept_data)
    avg_smart = (
        round(sum(d["avg_smart"] for d in dept_data if d.get("avg_smart")) / len(dept_data), 2)
        if dept_data else 0.0
    )
    strategic_percent = (
        round(sum(d["strategic_percent"] for d in dept_data if d.get("strategic_percent")) / len(dept_data), 1)
        if dept_data else 0.0
    )

    total_emps_result = await db.execute(
        select(func.count(Employee.id)).where(Employee.is_active == True)  # noqa: E712
    )
    total_employees = total_emps_result.scalar() or 0

    return {
        "quarter": quarter,
        "year": year,
        "total_employees": total_employees,
        "total_goals": total_goals,
        "avg_smart_company": avg_smart,
        "strategic_percent": strategic_percent,
        "departments": dept_data,
    }


def _generate_recommendations(
    weak_criteria: dict[str, float],
    goal_types: dict[str, int],
    strategic_percent: float,
) -> list[str]:
    recs = []
    for criterion, score in weak_criteria.items():
        if score < 0.6:
            messages = {
                "S": "Добавить обязательное поле 'предмет действия' в шаблон цели",
                "M": "Требовать числовой KPI при создании цели",
                "A": "Проверять достижимость на основе исторических данных команды",
                "R": "Усилить каскадирование: связывать цели со стратегией компании",
                "T": "Добавить обязательное поле 'дедлайн' в форму создания цели",
            }
            recs.append(messages.get(criterion, f"Улучшить критерий {criterion}"))

    activity_count = goal_types.get("activity", 0)
    total = sum(goal_types.values())
    if total > 0 and activity_count / total > 0.4:
        recs.append("Более 40% целей — activity-based. Провести обучение по переводу в output/impact формат")

    if strategic_percent < 50:
        recs.append("Менее 50% целей стратегически связаны. Усилить каскадирование со стратегией компании")

    return recs[:3]


def _empty_maturity(dept_id: uuid.UUID, dept_name: str, quarter: str, year: int) -> dict:
    return {
        "department_id": str(dept_id),
        "department_name": dept_name,
        "quarter": quarter,
        "year": year,
        "maturity_index": 0.0,
        "avg_smart": 0.0,
        "strategic_percent": 0.0,
        "total_goals": 0,
        "weak_criteria": {"S": 0.0, "M": 0.0, "A": 0.0, "R": 0.0, "T": 0.0},
        "goal_type_dist": {},
        "recommendations": ["Нет данных для анализа"],
    }


def _format_maturity(cache: DepartmentMaturityCache, dept_name: str) -> dict:
    return {
        "department_id": str(cache.department_id),
        "department_name": dept_name,
        "quarter": cache.quarter,
        "year": cache.year,
        "maturity_index": cache.maturity_index,
        "avg_smart": cache.avg_smart,
        "strategic_percent": cache.strategic_percent,
        "total_goals": cache.total_goals,
        "weak_criteria": cache.weak_criteria or {},
        "goal_type_dist": cache.goal_type_dist or {},
        "recommendations": cache.recommendations or [],
    }
