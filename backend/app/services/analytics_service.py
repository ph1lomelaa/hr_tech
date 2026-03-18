import uuid
import logging
import asyncio
import copy
from types import SimpleNamespace
from time import monotonic
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.hr_models import Department, Employee, Goal
from app.models.ai_models import DepartmentMaturityCache
from app.services.rule_based_evaluator import evaluate_goal_rule_based

logger = logging.getLogger(__name__)

_department_cache: dict[tuple[str, str, int], tuple[float, dict]] = {}
_company_cache: dict[tuple[str, int], tuple[float, dict]] = {}
_cache_lock = asyncio.Lock()


def _dept_cache_key(department_id: int, quarter: str, year: int) -> tuple[str, str, int]:
    return (str(department_id), quarter, year)


def _company_cache_key(quarter: str, year: int) -> tuple[str, int]:
    return (quarter, year)


def _prev_quarter(quarter: str, year: int) -> tuple[str, int]:
    """Returns the previous quarter and year."""
    q_num = int(quarter[1])  # "Q2" -> 2
    if q_num == 1:
        return "Q4", year - 1
    return f"Q{q_num - 1}", year


async def _read_cache(cache_key: tuple, company: bool = False) -> dict | None:
    ttl = max(0, settings.analytics_cache_ttl_seconds)
    if ttl == 0:
        return None

    now = monotonic()
    async with _cache_lock:
        storage = _company_cache if company else _department_cache
        entry = storage.get(cache_key)
        if not entry:
            return None
        expires_at, payload = entry
        if expires_at <= now:
            storage.pop(cache_key, None)
            return None
        return copy.deepcopy(payload)


async def _write_cache(cache_key: tuple, payload: dict, company: bool = False) -> None:
    ttl = max(0, settings.analytics_cache_ttl_seconds)
    if ttl == 0:
        return
    async with _cache_lock:
        storage = _company_cache if company else _department_cache
        storage[cache_key] = (monotonic() + ttl, copy.deepcopy(payload))


async def get_department_maturity(
    department_id: int,
    quarter: str,
    year: int,
    db: AsyncSession,
    force_refresh: bool = False,
) -> dict:
    key = _dept_cache_key(department_id, quarter, year)
    if not force_refresh:
        cached = await _read_cache(key)
        if cached is not None:
            return cached

    data = await _compute_department_maturity(department_id, quarter, year, db)
    await _write_cache(key, data)
    return data


async def _compute_department_maturity(
    department_id: int,
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
        .options(
            selectinload(Goal.evaluation),
            selectinload(Goal.employee).selectinload(Employee.position),
            selectinload(Goal.employee).selectinload(Employee.department),
        )
        .where(
            Goal.employee_id.in_(employee_ids),
            Goal.quarter == quarter,
            Goal.year == year,
        )
    )
    goals = goals_result.scalars().all()

    if not goals:
        return _empty_maturity(department_id, dept.name, quarter, year)

    # Агрегируем оценки (если оценки нет — считаем rule-based на лету)
    evaluations = []
    for goal in goals:
        if goal.evaluation:
            evaluations.append(goal.evaluation)
            continue

        goal_text = goal.goal_text or goal.description or goal.title
        employee = goal.employee
        position = employee.position.name if employee and employee.position else goal.position or "Сотрудник"
        department = employee.department.name if employee and employee.department else dept.name
        fallback = evaluate_goal_rule_based(
            goal_text=goal_text or "",
            position=position,
            department=department,
            context_block="",
        )
        scores = fallback.get("scores", {})
        evaluations.append(
            SimpleNamespace(
                smart_index=float(fallback.get("smart_index", 0.0)),
                score_s=float(scores.get("S", 0.5)),
                score_m=float(scores.get("M", 0.5)),
                score_a=float(scores.get("A", 0.5)),
                score_r=float(scores.get("R", 0.5)),
                score_t=float(scores.get("T", 0.5)),
                goal_type=fallback.get("goal_type", "output"),
                alignment_level=fallback.get("alignment_level", "operational"),
            )
        )

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

    # Реальное распределение стратегической связки
    alignment_dist = {"strategic": 0, "functional": 0, "operational": 0}
    for e in evaluations:
        level = (e.alignment_level or "operational").lower()
        if level not in alignment_dist:
            level = "operational"
        alignment_dist[level] += 1
    strategic_percent = round(alignment_dist["strategic"] / len(evaluations) * 100, 1)

    # Индекс зрелости = среднее из avg_smart + strategic_percent/100
    maturity_index = round((avg_smart + strategic_percent / 100) / 2, 2)

    # Распределение по качеству SMART
    smart_buckets = {"critical": 0, "needs_work": 0, "good": 0}
    for e in evaluations:
        idx = float(e.smart_index or 0.0)
        if idx < 0.5:
            smart_buckets["critical"] += 1
        elif idx < 0.7:
            smart_buckets["needs_work"] += 1
        else:
            smart_buckets["good"] += 1

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
        "alignment_dist": alignment_dist,
        "smart_buckets": smart_buckets,
        "recommendations": recommendations,
    }


async def get_company_dashboard(
    quarter: str,
    year: int,
    db: AsyncSession,
    force_refresh: bool = False,
) -> dict:
    key = _company_cache_key(quarter, year)
    if not force_refresh:
        cached = await _read_cache(key, company=True)
        if cached is not None:
            return cached

    depts_result = await db.execute(
        select(Department).where(Department.is_active == True)  # noqa: E712
    )
    departments = depts_result.scalars().all()

    dept_data = []
    for dept in departments:
        try:
            data = await get_department_maturity(
                dept.id,
                quarter,
                year,
                db,
                force_refresh=force_refresh,
            )
            dept_data.append(data)
        except Exception as e:
            await db.rollback()
            logger.warning(f"Failed to compute maturity for {dept.name}: {e}")

    total_goals = sum(d.get("total_goals", 0) for d in dept_data)
    avg_smart = (
        round(
            sum((d.get("avg_smart") or 0.0) * (d.get("total_goals") or 0) for d in dept_data) / total_goals,
            2,
        )
        if total_goals > 0
        else 0.0
    )
    alignment_dist = {"strategic": 0, "functional": 0, "operational": 0}
    for d in dept_data:
        dist = d.get("alignment_dist") or {}
        for key in alignment_dist:
            alignment_dist[key] += int(dist.get(key, 0))
    total_alignment = sum(alignment_dist.values())
    strategic_percent = (
        round(alignment_dist["strategic"] / total_alignment * 100, 1)
        if total_alignment > 0
        else 0.0
    )

    total_emps_result = await db.execute(
        select(func.count(Employee.id)).where(Employee.is_active == True)  # noqa: E712
    )
    total_employees = total_emps_result.scalar() or 0

    # Квартал назад — подтягиваем кэш из БД для расчёта динамики
    prev_q, prev_y = _prev_quarter(quarter, year)
    prev_caches_result = await db.execute(
        select(DepartmentMaturityCache).where(
            DepartmentMaturityCache.quarter == prev_q,
            DepartmentMaturityCache.year == prev_y,
        )
    )
    prev_caches = {str(c.department_id): c for c in prev_caches_result.scalars().all()}

    # Добавляем дельту зрелости к каждому подразделению
    for d in dept_data:
        prev = prev_caches.get(d["department_id"])
        d["maturity_delta"] = (
            round(d["maturity_index"] - prev.maturity_index, 2) if prev else None
        )

    # Агрегируем SMART-бакеты по компании
    company_smart_buckets = {"critical": 0, "needs_work": 0, "good": 0}
    for d in dept_data:
        for k in company_smart_buckets:
            company_smart_buckets[k] += d.get("smart_buckets", {}).get(k, 0)

    payload = {
        "quarter": quarter,
        "year": year,
        "total_employees": total_employees,
        "total_goals": total_goals,
        "avg_smart_company": avg_smart,
        "strategic_percent": strategic_percent,
        "alignment_dist": alignment_dist,
        "smart_buckets": company_smart_buckets,
        "departments": dept_data,
    }
    await _write_cache(key, payload, company=True)
    return payload


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


def _empty_maturity(dept_id: int, dept_name: str, quarter: str, year: int) -> dict:
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
        "alignment_dist": {"strategic": 0, "functional": 0, "operational": 0},
        "smart_buckets": {"critical": 0, "needs_work": 0, "good": 0},
        "maturity_delta": None,
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
        "alignment_dist": {
            "strategic": round((cache.strategic_percent or 0) / 100 * (cache.total_goals or 0)),
            "functional": 0,
            "operational": max(0, (cache.total_goals or 0) - round((cache.strategic_percent or 0) / 100 * (cache.total_goals or 0))),
        },
        "smart_buckets": {"critical": 0, "needs_work": 0, "good": 0},
        "maturity_delta": None,
        "recommendations": cache.recommendations or [],
    }
