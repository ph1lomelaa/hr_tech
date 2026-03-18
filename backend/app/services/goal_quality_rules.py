from __future__ import annotations

import math
import re
import uuid
from dataclasses import dataclass
from difflib import SequenceMatcher
from statistics import median

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import embed_texts
from app.config import settings
from app.models.ai_models import GoalAlert
from app.models.hr_models import Department, Employee, Goal, Position

_TOKEN_RE = re.compile(r"[a-zA-Zа-яА-Я0-9]+")
_NUMBER_RE = re.compile(r"(\d+(?:[.,]\d+)?)")
_PERCENT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")
_TIMEBOUND_RE = re.compile(
    r"(\bq[1-4]\b|квартал|месяц|год|до\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})",
    re.IGNORECASE,
)


@dataclass
class DuplicateCandidate:
    goal_id: uuid.UUID
    goal_text: str
    similarity: float
    scope: str
    employee_id: int


def normalize_goal_text(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.lower().split()).strip()


def _tokens(text: str) -> set[str]:
    return {token for token in _TOKEN_RE.findall(normalize_goal_text(text)) if len(token) > 1}


def _jaccard_similarity(a: str, b: str) -> float:
    ta = _tokens(a)
    tb = _tokens(b)
    if not ta or not tb:
        return 0.0
    union = ta | tb
    if not union:
        return 0.0
    return len(ta & tb) / len(union)


def _lexical_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    seq = SequenceMatcher(None, normalize_goal_text(a), normalize_goal_text(b)).ratio()
    jac = _jaccard_similarity(a, b)
    return round(max(seq, (seq + jac) / 2), 4)


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for a, b in zip(vec_a, vec_b):
        dot += a * b
        norm_a += a * a
        norm_b += b * b
    if norm_a <= 0 or norm_b <= 0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def _similarity_scores(query: str, candidates: list[str]) -> list[float]:
    lexical = [_lexical_similarity(query, candidate) for candidate in candidates]
    if not candidates:
        return lexical

    texts = [query, *candidates]
    embeddings = embed_texts(texts)
    if embeddings is None or len(embeddings) != len(texts):
        return lexical

    query_embedding = embeddings[0]
    scores: list[float] = []
    for idx, candidate in enumerate(candidates):
        semantic = _cosine_similarity(query_embedding, embeddings[idx + 1])
        lexical_score = lexical[idx]
        scores.append(round(max(lexical_score, semantic), 4))
    return scores


def _extract_numeric_targets(text: str) -> list[float]:
    normalized = normalize_goal_text(text)
    percents = [float(raw.replace(",", ".")) for raw in _PERCENT_RE.findall(normalized)]
    if percents:
        return percents
    values = [float(raw.replace(",", ".")) for raw in _NUMBER_RE.findall(normalized)]
    return values


def _extract_scale_value(text: str) -> float | None:
    values = _extract_numeric_targets(text)
    if not values:
        return None
    return float(median(values))


def _has_measurement_signal(text: str | None) -> bool:
    normalized = normalize_goal_text(text)
    if not normalized:
        return False
    if _extract_numeric_targets(normalized):
        return True
    return bool(re.search(r"\b(kpi|sla|csat|nps|mae|roi|окр|okr)\b", normalized))


def _has_time_signal(text: str | None) -> bool:
    normalized = normalize_goal_text(text)
    if not normalized:
        return False
    return bool(_TIMEBOUND_RE.search(normalized))


def _percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    if q <= 0:
        return float(min(values))
    if q >= 100:
        return float(max(values))
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    pos = (len(ordered) - 1) * q / 100.0
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return float(ordered[lo])
    return float(ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo))


def goal_similarity(goal_a: str, goal_b: str) -> float:
    return _similarity_scores(goal_a, [goal_b])[0] if goal_b else 0.0


def extract_goal_scale_value(goal_text: str) -> float | None:
    return _extract_scale_value(goal_text)


async def create_alert_if_absent(
    db: AsyncSession,
    employee_id: int,
    alert_type: str,
    message: str,
    severity: str = "warning",
    goal_id: uuid.UUID | None = None,
    notify_manager: bool = False,
    manager_message: str | None = None,
) -> bool:
    async def _exists(recipient_id: int, recipient_message: str) -> bool:
        conditions = [
            GoalAlert.employee_id == recipient_id,
            GoalAlert.alert_type == alert_type,
            GoalAlert.message == recipient_message,
            GoalAlert.is_read == False,  # noqa: E712
        ]
        if goal_id is None:
            conditions.append(GoalAlert.goal_id.is_(None))
        else:
            conditions.append(GoalAlert.goal_id == goal_id)

        existing = await db.execute(select(GoalAlert).where(*conditions))
        return existing.scalar_one_or_none() is not None

    async def _create_for(recipient_id: int, recipient_message: str) -> bool:
        if await _exists(recipient_id, recipient_message):
            return False

        db.add(
            GoalAlert(
                employee_id=recipient_id,
                goal_id=goal_id,
                alert_type=alert_type,
                severity=severity,
                message=recipient_message,
            )
        )
        return True

    created = await _create_for(employee_id, message)
    manager_created = False

    if notify_manager:
        employee = await db.get(Employee, employee_id)
        manager_id = employee.manager_id if employee else None
        if manager_id and manager_id != employee_id:
            subject_name = (employee.full_name or "").strip() if employee else ""
            resolved_manager_message = manager_message
            if not resolved_manager_message:
                resolved_manager_message = (
                    f"Сотрудник {subject_name}: {message}"
                    if subject_name
                    else message
                )
            manager_created = await _create_for(manager_id, resolved_manager_message)

    if not created and not manager_created:
        return False

    await db.commit()
    return True


async def validate_goal_set_constraints(
    employee_id: int,
    quarter: str | None,
    year: int | None,
    db: AsyncSession,
) -> dict:
    if quarter is None or year is None:
        return {"total_goals": 0, "weight_total": 0.0, "warnings": []}

    result = await db.execute(
        select(Goal).where(
            Goal.employee_id == employee_id,
            Goal.quarter == quarter,
            Goal.year == year,
        )
    )
    goals = result.scalars().all()

    total_goals = len(goals)
    weight_total = round(sum(g.weight or 0.0 for g in goals), 2)
    warnings: list[str] = []

    if total_goals < settings.min_goals:
        warning = (
            f"Количество целей: {total_goals}. "
            f"Рекомендуемый диапазон {settings.min_goals}–{settings.max_goals}."
        )
        warnings.append(warning)
        await create_alert_if_absent(
            db=db,
            employee_id=employee_id,
            alert_type="too_few_goals",
            severity="critical" if total_goals == 0 else "warning",
            message=f"{warning} Период: {quarter} {year}.",
            notify_manager=True,
        )

    if total_goals > settings.max_goals:
        warning = (
            f"Количество целей: {total_goals}. "
            f"Рекомендуемый диапазон {settings.min_goals}–{settings.max_goals}."
        )
        warnings.append(warning)
        await create_alert_if_absent(
            db=db,
            employee_id=employee_id,
            alert_type="too_many_goals",
            severity="warning",
            message=f"{warning} Период: {quarter} {year}.",
            notify_manager=True,
        )

    if total_goals > 0 and abs(weight_total - 100.0) > settings.weight_tolerance:
        warning = f"Сумма весов целей: {weight_total}%. Требуется 100%."
        warnings.append(warning)
        await create_alert_if_absent(
            db=db,
            employee_id=employee_id,
            alert_type="weight_mismatch",
            severity="warning",
            message=f"{warning} Период: {quarter} {year}.",
            notify_manager=True,
        )

    return {"total_goals": total_goals, "weight_total": weight_total, "warnings": warnings}


async def _resolve_scope(
    employee_id: int | None,
    position: str,
    department: str,
    db: AsyncSession,
) -> tuple[int | None, int | None]:
    position_id: int | None = None
    department_id: int | None = None

    if employee_id:
        employee = await db.get(Employee, employee_id)
        if employee:
            return employee.position_id, employee.department_id

    normalized_position = normalize_goal_text(position)
    pos = await db.execute(
        select(Position.id).where(func.lower(Position.name).like(f"%{normalized_position}%"))
    )
    position_id = pos.scalar_one_or_none()

    normalized_department = normalize_goal_text(department)
    dept = await db.execute(
        select(Department.id).where(func.lower(Department.name).like(f"%{normalized_department}%"))
    )
    department_id = dept.scalar_one_or_none()

    return position_id, department_id


async def _collect_peer_goals(
    employee_id: int | None,
    position: str,
    department: str,
    quarter: str | None,
    year: int | None,
    db: AsyncSession,
    exclude_goal_id: uuid.UUID | None = None,
) -> list[str]:
    position_id, department_id = await _resolve_scope(employee_id, position, department, db)
    if not position_id or not department_id:
        return []

    peer_employees = await db.execute(
        select(Employee.id).where(
            Employee.position_id == position_id,
            Employee.department_id == department_id,
            Employee.is_active == True,  # noqa: E712
        )
    )
    peer_ids = [row[0] for row in peer_employees.fetchall()]
    if not peer_ids:
        return []

    conditions = [Goal.employee_id.in_(peer_ids)]
    if exclude_goal_id:
        conditions.append(Goal.id != exclude_goal_id)
    if year is not None:
        if quarter:
            conditions.append(
                or_(Goal.year < year, and_(Goal.year == year, Goal.quarter != quarter))
            )
        else:
            conditions.append(Goal.year < year)

    stmt = (
        select(
            Goal.id,
            Goal.goal_text,
            Goal.description,
            Goal.title,
            Goal.metric,
            Goal.deadline,
            Goal.weight,
            Goal.status,
            Goal.employee_id,
        )
        .where(*conditions)
        .limit(settings.duplicate_scope_limit)
    )
    result = await db.execute(stmt)
    rows = result.all()
    goals: list[dict] = []
    for goal_id, goal_text, description, title, metric, deadline, weight, status, owner_id in rows:
        text = goal_text or description or title
        if not text:
            continue
        goals.append(
            {
                "goal_id": goal_id,
                "text": text,
                "metric": metric,
                "deadline": deadline,
                "weight": weight,
                "status": status,
                "employee_id": owner_id,
            }
        )
    return goals


async def assess_achievability_against_history(
    goal_text: str,
    position: str,
    department: str,
    employee_id: int | None,
    quarter: str | None,
    year: int | None,
    goal_id: uuid.UUID | None,
    db: AsyncSession | None,
) -> dict:
    if db is None:
        return {
            "warning": None,
            "baseline_count": 0,
            "current_scale": None,
            "median_scale": None,
            "risk_score": 0.0,
            "factors": [],
        }

    peer_goals = await _collect_peer_goals(
        employee_id=employee_id,
        position=position,
        department=department,
        quarter=quarter,
        year=year,
        db=db,
        exclude_goal_id=goal_id,
    )
    history_texts = [str(goal["text"]) for goal in peer_goals]
    history_scales = [value for value in (_extract_scale_value(text) for text in history_texts) if value is not None]
    current_scale = _extract_scale_value(goal_text)
    median_scale = float(median(history_scales)) if history_scales else None

    # 1) Блок формальных сигналов: KPI и срок.
    current_has_metric = _has_measurement_signal(goal_text)
    current_has_time = _has_time_signal(goal_text)

    # 2) Сигналы из похожих исторических целей (семантика + статусы).
    similarity_scores = _similarity_scores(goal_text, history_texts) if history_texts else []
    similar_candidates: list[dict] = []
    for idx, score in enumerate(similarity_scores):
        if score < settings.achievability_similarity_threshold:
            continue
        goal_item = dict(peer_goals[idx])
        goal_item["similarity"] = score
        similar_candidates.append(goal_item)
    similar_candidates.sort(key=lambda item: item.get("similarity", 0.0), reverse=True)

    def _approval_rate(items: list[dict]) -> float | None:
        reviewable = [
            item for item in items
            if str(item.get("status") or "").lower() in {"approved", "in_progress", "done", "cancelled"}
        ]
        if not reviewable:
            return None
        approved = sum(
            1 for item in reviewable
            if str(item.get("status")).lower() in {"approved", "in_progress", "done"}
        )
        return approved / len(reviewable)

    similar_approval_rate = _approval_rate(similar_candidates)
    overall_approval_rate = _approval_rate(peer_goals)

    approved_similar = [
        item for item in similar_candidates
        if str(item.get("status") or "").lower() in {"approved", "in_progress", "done"}
    ]
    approved_similar_metric_share = (
        sum(1 for item in approved_similar if _has_measurement_signal(item.get("text") or item.get("metric")))
        / len(approved_similar)
        if approved_similar
        else None
    )
    approved_similar_time_share = (
        sum(1 for item in approved_similar if _has_time_signal(item.get("text")) or item.get("deadline") is not None)
        / len(approved_similar)
        if approved_similar
        else None
    )

    # 3) Сигнал масштаба относительно истории (медиана + P75), если есть числа.
    scale_ratio: float | None = None
    stretch_ratio: float | None = None
    p75_scale = _percentile(history_scales, 75.0) if history_scales else None
    if current_scale is not None and median_scale and median_scale > 0:
        scale_ratio = max(current_scale / median_scale, median_scale / current_scale) if current_scale > 0 else float("inf")
    if current_scale is not None and p75_scale and p75_scale > 0:
        stretch_ratio = current_scale / p75_scale

    risk_score = 0.0
    factors: list[str] = []
    diagnostics: dict[str, float | int | None] = {
        "similar_count": len(similar_candidates),
        "similar_approval_rate": round(similar_approval_rate, 3) if similar_approval_rate is not None else None,
        "overall_approval_rate": round(overall_approval_rate, 3) if overall_approval_rate is not None else None,
        "scale_ratio": round(scale_ratio, 3) if scale_ratio is not None else None,
        "stretch_ratio": round(stretch_ratio, 3) if stretch_ratio is not None else None,
    }

    if scale_ratio is not None and scale_ratio >= settings.achievability_ratio_threshold:
        risk_score += 0.45
        factors.append(
            f"масштаб сильно отличается от истории роли (медиана ~{median_scale:.1f}, в цели ~{current_scale:.1f})"
        )
    elif stretch_ratio is not None and stretch_ratio >= max(1.5, settings.achievability_ratio_threshold - 0.2):
        risk_score += 0.2
        factors.append(
            f"цель находится в зоне high-stretch относительно P75 истории (~{p75_scale:.1f})"
        )

    if (
        len(similar_candidates) >= settings.achievability_min_similar_goals
        and similar_approval_rate is not None
        and similar_approval_rate <= settings.achievability_low_approval_threshold
    ):
        risk_score += 0.35
        factors.append(
            f"по похожим целям низкая доля одобрения ({similar_approval_rate * 100:.0f}%)"
        )

    if (
        approved_similar_metric_share is not None
        and approved_similar_metric_share >= 0.7
        and not current_has_metric
    ):
        risk_score += 0.15
        factors.append("у цели нет явного KPI, тогда как в успешных похожих целях KPI обычно присутствует")

    if (
        approved_similar_time_share is not None
        and approved_similar_time_share >= 0.7
        and not current_has_time
    ):
        risk_score += 0.15
        factors.append("у цели не указан проверяемый срок, что снижает достижимость")

    if overall_approval_rate is not None and overall_approval_rate < 0.5 and len(peer_goals) >= 12:
        risk_score += 0.1
        factors.append("в подразделении/роли исторически высокий уровень отклонений формулировок")

    risk_score = round(min(1.0, risk_score), 2)
    warning = None
    if risk_score >= settings.achievability_warning_score_threshold and factors:
        warning = "Цель может быть нереалистичной: " + "; ".join(factors[:3]) + "."

    return {
        "warning": warning,
        "baseline_count": len(history_scales),
        "current_scale": current_scale,
        "median_scale": median_scale,
        "risk_score": risk_score,
        "factors": factors,
        "diagnostics": diagnostics,
    }


async def find_goal_duplicates(
    goal_text: str,
    employee_id: int,
    quarter: str | None,
    year: int | None,
    db: AsyncSession,
    exclude_goal_id: uuid.UUID | None = None,
) -> list[DuplicateCandidate]:
    employee = await db.get(Employee, employee_id)
    if employee is None:
        return []

    own_conditions = [Goal.employee_id == employee_id]
    if quarter:
        own_conditions.append(Goal.quarter == quarter)
    if year is not None:
        own_conditions.append(Goal.year == year)
    if exclude_goal_id:
        own_conditions.append(Goal.id != exclude_goal_id)

    own_result = await db.execute(
        select(Goal.id, Goal.goal_text, Goal.description, Goal.title, Goal.employee_id).where(*own_conditions)
    )
    own_rows = own_result.all()

    team_rows: list[tuple] = []
    if employee.department_id:
        team_conditions = [
            Goal.department_id == employee.department_id,
            Goal.employee_id != employee_id,
        ]
        if quarter:
            team_conditions.append(Goal.quarter == quarter)
        if year is not None:
            team_conditions.append(Goal.year == year)
        if exclude_goal_id:
            team_conditions.append(Goal.id != exclude_goal_id)
        team_result = await db.execute(
            select(Goal.id, Goal.goal_text, Goal.description, Goal.title, Goal.employee_id)
            .where(*team_conditions)
            .limit(settings.duplicate_scope_limit)
        )
        team_rows = team_result.all()

    payload: list[tuple[uuid.UUID, str, str, int]] = []
    for row in own_rows:
        text = row[1] or row[2] or row[3]
        if text:
            payload.append((row[0], text, "employee", row[4]))
    for row in team_rows:
        text = row[1] or row[2] or row[3]
        if text:
            payload.append((row[0], text, "department", row[4]))

    if not payload:
        return []

    scores = _similarity_scores(goal_text, [item[1] for item in payload])
    matches: list[DuplicateCandidate] = []
    for idx, score in enumerate(scores):
        if score < settings.duplicate_similarity_threshold:
            continue
        goal_id, text, scope, owner_employee_id = payload[idx]
        matches.append(
            DuplicateCandidate(
                goal_id=goal_id,
                goal_text=text,
                similarity=round(score, 2),
                scope=scope,
                employee_id=owner_employee_id,
            )
        )

    matches.sort(key=lambda item: item.similarity, reverse=True)
    return matches[:3]
