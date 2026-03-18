import uuid
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.ai.llm_client import call_llm
from app.ai.prompts import SMART_EVALUATE_PROMPT
from app.models.ai_models import SmartEvaluation
from app.models.hr_models import Department, Employee, Goal, KpiCatalog, KpiTimeseries
from app.schemas.evaluation import EvaluateGoalResponse, SmartScores
from app.config import settings
from app.services.goal_quality_rules import assess_achievability_against_history, create_alert_if_absent
from app.services.rule_based_evaluator import evaluate_goal_rule_based

logger = logging.getLogger(__name__)
SMART_CRITERIA = ("S", "M", "A", "R", "T")


def _normalize_criteria_explanations(raw_value: object) -> dict[str, str]:
    if not isinstance(raw_value, dict):
        return {}
    normalized: dict[str, str] = {}
    for key in SMART_CRITERIA:
        value = raw_value.get(key)
        if not isinstance(value, str):
            continue
        text = " ".join(value.split()).strip()
        if text:
            normalized[key] = text
    return normalized


def _default_criterion_explanation(
    criterion: str,
    score: float,
    weak_criteria: list[str],
    alignment_source: str | None,
    achievability_warning: str | None,
) -> str:
    score_note = f"Оценка {score:.2f}."
    weak = criterion in weak_criteria
    if criterion == "S":
        return (
            f"{score_note} Формулировка цели недостаточно конкретна, добавьте точный ожидаемый результат."
            if weak
            else f"{score_note} Цель сформулирована конкретно, предмет действия определён."
        )
    if criterion == "M":
        return (
            f"{score_note} Не хватает измеримого индикатора: добавьте число, процент или единицу измерения."
            if weak
            else f"{score_note} В цели есть измеримый KPI для проверки выполнения."
        )
    if criterion == "A":
        if achievability_warning:
            return f"{score_note} {achievability_warning}"
        return (
            f"{score_note} Достижимость под вопросом, масштаб лучше сверить с историей аналогичных ролей."
            if weak
            else f"{score_note} Масштаб цели выглядит достижимым для роли и подразделения."
        )
    if criterion == "R":
        if weak:
            return f"{score_note} Связь цели с задачами роли/стратегией компании выражена слабо."
        if alignment_source:
            return f"{score_note} Цель связана с источником: {alignment_source}."
        return f"{score_note} Цель релевантна роли и задачам подразделения."
    if criterion == "T":
        return (
            f"{score_note} Не указан чёткий срок; добавьте дату или период выполнения."
            if weak
            else f"{score_note} Срок выполнения сформулирован и проверяем."
        )
    return score_note


def _build_criteria_explanations(
    result: dict,
    scores: SmartScores,
    weak_criteria: list[str],
    achievability_warning: str | None,
) -> dict[str, str]:
    llm_explanations = _normalize_criteria_explanations(result.get("criteria_explanations"))
    values = {
        "S": scores.S,
        "M": scores.M,
        "A": scores.A,
        "R": scores.R,
        "T": scores.T,
    }
    alignment_source = result.get("alignment_source")
    explanations: dict[str, str] = {}
    for criterion in SMART_CRITERIA:
        llm_value = llm_explanations.get(criterion)
        if llm_value:
            explanations[criterion] = llm_value
            continue
        explanations[criterion] = _default_criterion_explanation(
            criterion=criterion,
            score=float(values[criterion]),
            weak_criteria=weak_criteria,
            alignment_source=alignment_source,
            achievability_warning=achievability_warning,
        )
    return explanations


async def evaluate_goal(
    goal_text: str,
    position: str = "Сотрудник",
    department: str = "Подразделение",
    goal_id: uuid.UUID | None = None,
    employee_id: int | None = None,
    quarter: str | None = None,
    year: int | None = None,
    db: AsyncSession | None = None,
    prefer_rule_based: bool = False,
) -> EvaluateGoalResponse:
    context_block = await _build_evaluation_context(
        position=position,
        department=department,
        employee_id=employee_id,
        quarter=quarter,
        year=year,
        db=db,
    )
    prompt = SMART_EVALUATE_PROMPT.format(
        goal_text=goal_text,
        position=position,
        department=department,
        context_block=context_block,
    )

    model_version = "llm-mixed"
    if prefer_rule_based:
        result = evaluate_goal_rule_based(
            goal_text=goal_text,
            position=position,
            department=department,
            context_block=context_block,
        )
        model_version = result.get("model_version", "rule-based-v1")
    else:
        try:
            result = await call_llm(prompt)
            model_version = str(result.get("_llm_model") or result.get("_llm_provider") or model_version)
        except Exception as e:
            logger.warning(f"LLM unavailable, fallback to rule-based evaluator: {e}")
            result = evaluate_goal_rule_based(
                goal_text=goal_text,
                position=position,
                department=department,
                context_block=context_block,
            )
            model_version = result.get("model_version", "rule-based-v1")

    scores_raw = result.get("scores", {})
    scores = SmartScores(
        S=float(scores_raw.get("S", 0.5)),
        M=float(scores_raw.get("M", 0.5)),
        A=float(scores_raw.get("A", 0.5)),
        R=float(scores_raw.get("R", 0.5)),
        T=float(scores_raw.get("T", 0.5)),
    )

    weak_criteria = list(result.get("weak_criteria", []))
    recommendations = list(result.get("recommendations", []))
    achievability_warning: str | None = None

    if db is not None:
        history_check = await assess_achievability_against_history(
            goal_text=goal_text,
            position=position,
            department=department,
            employee_id=employee_id,
            quarter=quarter,
            year=year,
            goal_id=goal_id,
            db=db,
        )
        achievability_warning = history_check.get("warning")
        if achievability_warning:
            scores.A = min(scores.A, 0.6)
            if "A" not in weak_criteria:
                weak_criteria.append("A")
            if achievability_warning not in recommendations:
                recommendations.append(achievability_warning)

    smart_index = round((scores.S + scores.M + scores.A + scores.R + scores.T) / 5, 2)
    criteria_explanations = _build_criteria_explanations(
        result=result,
        scores=scores,
        weak_criteria=weak_criteria,
        achievability_warning=achievability_warning,
    )

    response = EvaluateGoalResponse(
        smart_index=smart_index,
        scores=scores,
        criteria_explanations=criteria_explanations,
        goal_type=result.get("goal_type", "output"),
        alignment_level=result.get("alignment_level", "functional"),
        alignment_source=result.get("alignment_source"),
        weak_criteria=weak_criteria,
        recommendations=recommendations,
        rewrite=result.get("rewrite", ""),
        model_version=model_version,
        achievability_warning=achievability_warning,
    )

    # Сохраняем в БД если есть goal_id и сессия
    if goal_id and db:
        await _save_evaluation(response, goal_id, db)
        if achievability_warning and employee_id:
            await _create_alert(
                employee_id=employee_id,
                goal_id=goal_id,
                alert_type="achievability_risk",
                severity="warning",
                message=achievability_warning,
                db=db,
            )
        if smart_index < settings.smart_threshold and employee_id:
            await _create_alert(
                employee_id=employee_id,
                goal_id=goal_id,
                alert_type="low_smart",
                severity="warning",
                message=f"SMART-индекс цели {smart_index:.2f} ниже порога {settings.smart_threshold}. Слабые критерии: {', '.join(response.weak_criteria)}",
                db=db,
            )
        if employee_id and response.alignment_level != "strategic":
            alignment_label = {
                "functional": "функциональная связка",
                "operational": "операционная связка",
            }.get(response.alignment_level, response.alignment_level or "не определён")
            source_suffix = (
                f" Источник: {response.alignment_source}."
                if response.alignment_source
                else ""
            )
            await _create_alert(
                employee_id=employee_id,
                goal_id=goal_id,
                alert_type="alignment_gap",
                severity="warning",
                message=(
                    "У цели нет стратегической связки. "
                    f"Текущий уровень: {alignment_label}.{source_suffix}"
                ),
                db=db,
            )

    return response


async def _save_evaluation(
    response: EvaluateGoalResponse,
    goal_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    existing = await db.execute(
        select(SmartEvaluation).where(SmartEvaluation.goal_id == goal_id)
    )
    evaluation = existing.scalar_one_or_none()

    if evaluation:
        evaluation.score_s = response.scores.S
        evaluation.score_m = response.scores.M
        evaluation.score_a = response.scores.A
        evaluation.score_r = response.scores.R
        evaluation.score_t = response.scores.T
        evaluation.smart_index = response.smart_index
        evaluation.goal_type = response.goal_type
        evaluation.alignment_level = response.alignment_level
        evaluation.alignment_source = response.alignment_source
        evaluation.weak_criteria = response.weak_criteria
        evaluation.recommendations = response.recommendations
        evaluation.rewrite = response.rewrite
        evaluation.model_version = response.model_version
    else:
        evaluation = SmartEvaluation(
            goal_id=goal_id,
            score_s=response.scores.S,
            score_m=response.scores.M,
            score_a=response.scores.A,
            score_r=response.scores.R,
            score_t=response.scores.T,
            smart_index=response.smart_index,
            goal_type=response.goal_type,
            alignment_level=response.alignment_level,
            alignment_source=response.alignment_source,
            weak_criteria=response.weak_criteria,
            recommendations=response.recommendations,
            rewrite=response.rewrite,
            model_version=response.model_version,
        )
        db.add(evaluation)

    await db.commit()


async def _create_alert(
    employee_id: int,
    goal_id: uuid.UUID | None,
    alert_type: str,
    severity: str,
    message: str,
    db: AsyncSession,
    *,
    notify_manager: bool = True,
) -> None:
    await create_alert_if_absent(
        db=db,
        employee_id=employee_id,
        goal_id=goal_id,
        alert_type=alert_type,
        severity=severity,
        message=message,
        notify_manager=notify_manager,
    )


async def _build_evaluation_context(
    position: str,
    department: str,
    employee_id: int | None,
    quarter: str | None,
    year: int | None,
    db: AsyncSession | None,
) -> str:
    """
    Собирает контекст для оценки релевантности/стратегической связки:
    - релевантные фрагменты ВНД/стратегии;
    - цели руководителя сотрудника за период.
    """
    if db is None:
        return "Контекст недоступен (оценка без подключения к БД)."

    lines: list[str] = []
    department_name = department
    department_code: str | None = None
    department_id: int | None = None
    manager_id: int | None = None
    if employee_id:
        employee_result = await db.execute(
            select(Employee)
            .options(selectinload(Employee.department))
            .where(Employee.id == employee_id)
        )
        employee_profile = employee_result.scalar_one_or_none()
        if employee_profile:
            manager_id = employee_profile.manager_id
            if employee_profile.department:
                department_name = employee_profile.department.name or department
                department_code = employee_profile.department.code
                department_id = employee_profile.department.id

    if department_id is None and department_name:
        dept_result = await db.execute(
            select(Department.id).where(
                func.lower(Department.name) == department_name.strip().lower()
            ).limit(1)
        )
        department_id = dept_result.scalar_one_or_none()

    try:
        from app.services.rag_service import get_relevant_vnd

        chunks = await get_relevant_vnd(
            position=position,
            department=department_name,
            focus_direction=None,
            n_results=3,
            db=db,
            department_code=department_code,
            department_id=department_id,
        )
        if chunks:
            lines.append("Релевантные документы:")
            for idx, chunk in enumerate(chunks, 1):
                meta = chunk.get("metadata", {})
                title = meta.get("doc_title", "Документ")
                doc_type = meta.get("doc_type", "document")
                excerpt = " ".join((chunk.get("text") or "").split())[:220]
                lines.append(f"{idx}. {doc_type}: {title} | {excerpt}")
    except Exception:
        lines.append("Релевантные документы: не удалось извлечь.")

    kpi_lines = await _load_department_kpis(
        department_id=department_id,
        year=year,
        db=db,
    )
    if kpi_lines:
        lines.append("KPI подразделения:")
        lines.extend(kpi_lines)

    if manager_id and quarter and year:
        mgr_result = await db.execute(
            select(Goal).where(
                Goal.employee_id == manager_id,
                Goal.quarter == quarter,
                Goal.year == year,
                Goal.status != "draft",
            ).limit(3)
        )
        manager_goals = mgr_result.scalars().all()
        if manager_goals:
            lines.append(f"Цели руководителя за {quarter} {year}:")
            for idx, goal in enumerate(manager_goals, 1):
                goal_text = goal.goal_text or goal.description or goal.title
                if goal_text:
                    lines.append(f"{idx}. {goal_text}")

    return "\n".join(lines) if lines else "Контекст для связки не найден."


async def _load_department_kpis(
    department_id: int | None,
    year: int | None,
    db: AsyncSession,
    limit: int = 5,
) -> list[str]:
    if department_id is None:
        return []

    stmt = (
        select(
            KpiCatalog.name,
            KpiCatalog.unit,
            KpiTimeseries.period,
            KpiTimeseries.value,
        )
        .join(KpiTimeseries, KpiTimeseries.kpi_id == KpiCatalog.id)
        .where(KpiTimeseries.department_id == department_id)
    )
    if year is not None:
        stmt = stmt.where(func.extract("year", KpiTimeseries.period) == year)
    stmt = stmt.order_by(KpiTimeseries.period.desc()).limit(limit)

    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    lines: list[str] = []
    for idx, (name, unit, period, value) in enumerate(rows, start=1):
        unit_part = f" {unit}" if unit else ""
        lines.append(f"{idx}. {name}: {value}{unit_part} ({period})")
    return lines


async def batch_evaluate(
    employee_id: int,
    quarter: str,
    year: int,
    db: AsyncSession,
) -> dict:
    """
    Пакетная оценка всех целей сотрудника за квартал.
    """
    # Достаём сотрудника
    emp_result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.department))
        .where(Employee.id == employee_id)
    )
    employee = emp_result.scalar_one_or_none()
    if not employee:
        return {"error": "Employee not found"}

    # Достаём цели
    goals_result = await db.execute(
        select(Goal).where(
            Goal.employee_id == employee_id,
            Goal.quarter == quarter,
            Goal.year == year,
        )
    )
    goals = goals_result.scalars().all()

    if not goals:
        # Алерт: нет целей
        await _create_alert(
            employee_id=employee_id,
            goal_id=None,
            alert_type="too_few_goals",
            severity="critical",
            message=f"На {quarter} {year} не поставлено ни одной цели",
            db=db,
        )
        return {
            "employee_id": str(employee_id),
            "quarter": quarter,
            "total_goals": 0,
            "avg_smart": 0.0,
            "weight_total": 0.0,
            "weak_criteria_summary": {"S": 0.0, "M": 0.0, "A": 0.0, "R": 0.0, "T": 0.0},
            "goals": [],
            "alerts": ["Нет целей на квартал"],
        }

    position = employee.position.name if employee.position else "Сотрудник"
    department = employee.department.name if employee.department else "Подразделение"

    evaluated = []
    alerts = []
    total_weight = 0.0

    for goal in goals:
        text = goal.goal_text or goal.description or goal.title
        eval_result = await evaluate_goal(
            goal_text=text,
            position=position,
            department=department,
            goal_id=goal.id,
            employee_id=employee_id,
            quarter=quarter,
            year=year,
            db=db,
            prefer_rule_based=True,
        )
        evaluated.append({"goal": goal, "eval": eval_result})
        if goal.weight:
            total_weight += goal.weight

    # Проверка суммы весов
    if abs(total_weight - 100.0) > settings.weight_tolerance and total_weight > 0:
        weight_message = f"Сумма весов целей {total_weight:.0f}% (должно быть 100%)"
        alerts.append(weight_message)
        await _create_alert(
            employee_id=employee_id,
            goal_id=None,
            alert_type="weight_mismatch",
            severity="warning",
            message=weight_message,
            db=db,
        )

    # Проверка количества
    if len(goals) < settings.min_goals:
        alerts.append(f"Мало целей: {len(goals)} (минимум {settings.min_goals})")
        await _create_alert(
            employee_id=employee_id,
            goal_id=None,
            alert_type="too_few_goals",
            severity="warning",
            message=f"Целей {len(goals)}, рекомендуется {settings.min_goals}–{settings.max_goals}",
            db=db,
        )
    if len(goals) > settings.max_goals:
        too_many_message = f"Много целей: {len(goals)} (максимум {settings.max_goals})"
        alerts.append(too_many_message)
        await _create_alert(
            employee_id=employee_id,
            goal_id=None,
            alert_type="too_many_goals",
            severity="warning",
            message=too_many_message,
            db=db,
        )

    # Слабые критерии по всем целям
    criteria_scores = {"S": [], "M": [], "A": [], "R": [], "T": []}
    for item in evaluated:
        e = item["eval"]
        criteria_scores["S"].append(e.scores.S)
        criteria_scores["M"].append(e.scores.M)
        criteria_scores["A"].append(e.scores.A)
        criteria_scores["R"].append(e.scores.R)
        criteria_scores["T"].append(e.scores.T)

    avg_scores = {k: round(sum(v) / len(v), 2) for k, v in criteria_scores.items()}
    avg_smart = round(sum(item["eval"].smart_index for item in evaluated) / len(evaluated), 2)

    return {
        "employee_id": str(employee_id),
        "quarter": quarter,
        "total_goals": len(goals),
        "avg_smart": avg_smart,
        "weight_total": round(total_weight, 2),
        "weak_criteria_summary": avg_scores,
        "goals": [
            {
                "goal_id": str(item["goal"].id),
                "goal_text": item["goal"].goal_text or item["goal"].title,
                "smart_index": item["eval"].smart_index,
                "scores": item["eval"].scores.model_dump(),
                "goal_type": item["eval"].goal_type,
                "weak_criteria": item["eval"].weak_criteria,
            }
            for item in evaluated
        ],
        "alerts": alerts,
    }
