from __future__ import annotations

import re


def _score_specific(text: str) -> float:
    has_action = bool(
        re.search(
            r"\b(увеличить|снизить|сократить|внедрить|запустить|достичь|обеспечить|разработать|повысить)\b",
            text,
        )
    )
    words = len(text.split())
    if has_action and words >= 8:
        return 0.85
    if has_action:
        return 0.65
    return 0.4


def _score_measurable(text: str) -> float:
    has_number = bool(re.search(r"\d", text))
    has_percent = bool(re.search(r"%|процент|доля", text))
    if has_number and has_percent:
        return 0.9
    if has_number:
        return 0.78
    return 0.35


def _score_achievable(text: str) -> float:
    words = len(text.split())
    if words >= 10:
        return 0.76
    if words >= 6:
        return 0.66
    return 0.5


def _score_relevant(text: str, position: str, department: str) -> float:
    t = text.lower()
    context_hint = f"{position} {department}".lower()
    if any(token in t for token in context_hint.split() if len(token) > 3):
        return 0.82
    if re.search(r"стратег|kpi|клиент|команд|подраздел", t):
        return 0.74
    return 0.58


def _score_timebound(text: str) -> float:
    t = text.lower()
    if re.search(r"\d{4}-\d{2}-\d{2}", t):
        return 0.9
    if re.search(r"(до|к)\s+\d{1,2}[./]\d{1,2}[./]\d{2,4}", t):
        return 0.88
    if re.search(r"\b(q[1-4]|квартал|месяц|год)\b", t):
        return 0.7
    return 0.35


def _goal_type(text: str) -> str:
    t = text.lower()
    if re.search(r"\b(выручк|прибыл|nps|retention|отток|доход|маржиналь|затрат)\b", t):
        return "impact"
    if re.search(r"\b(внедрить|провести|организовать|разработать|создать)\b", t) and not re.search(r"\d|%", t):
        return "activity"
    return "output"


def _alignment_level(text: str) -> str:
    t = text.lower()
    if re.search(r"\b(стратег|корпоратив|компан)\b", t):
        return "strategic"
    if re.search(r"\b(kpi|подраздел|команд|департамент)\b", t):
        return "functional"
    return "operational"


def _alignment_source_from_context(context_block: str) -> str | None:
    for line in context_block.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("1.") or line.startswith("[1]"):
            return line
    return None


def _criterion_explanation(
    criterion: str,
    score: float,
    weak_criteria: list[str],
    alignment_source: str | None,
) -> str:
    score_note = f"Оценка {score:.2f}."
    weak = criterion in weak_criteria
    if criterion == "S":
        return (
            f"{score_note} Формулировка недостаточно конкретна: нужен точный ожидаемый результат."
            if weak
            else f"{score_note} Предмет действия обозначен достаточно конкретно."
        )
    if criterion == "M":
        return (
            f"{score_note} Не хватает измеримого KPI или числового ориентира."
            if weak
            else f"{score_note} Указан измеримый показатель для проверки результата."
        )
    if criterion == "A":
        return (
            f"{score_note} Масштаб цели требует проверки достижимости на исторических данных роли."
            if weak
            else f"{score_note} Масштаб цели выглядит реалистичным для роли."
        )
    if criterion == "R":
        if weak:
            return f"{score_note} Связка с задачами роли/подразделения выражена слабо."
        if alignment_source:
            return f"{score_note} Есть связка с контекстом: {alignment_source}."
        return f"{score_note} Цель релевантна роли и направлению подразделения."
    if criterion == "T":
        return (
            f"{score_note} Нет чёткого срока: добавьте дату или период выполнения."
            if weak
            else f"{score_note} Срок выполнения указан и проверяем."
        )
    return score_note


def evaluate_goal_rule_based(
    goal_text: str,
    position: str,
    department: str,
    context_block: str,
) -> dict:
    normalized = " ".join(goal_text.lower().split())

    score_s = _score_specific(normalized)
    score_m = _score_measurable(normalized)
    score_a = _score_achievable(normalized)
    score_r = _score_relevant(normalized, position=position, department=department)
    score_t = _score_timebound(normalized)

    smart_index = round((score_s + score_m + score_a + score_r + score_t) / 5, 2)
    goal_type = _goal_type(normalized)
    alignment_level = _alignment_level(normalized)
    alignment_source = _alignment_source_from_context(context_block)

    weak_criteria: list[str] = []
    if score_s < 0.6:
        weak_criteria.append("S")
    if score_m < 0.6:
        weak_criteria.append("M")
    if score_a < 0.6:
        weak_criteria.append("A")
    if score_r < 0.6:
        weak_criteria.append("R")
    if score_t < 0.6:
        weak_criteria.append("T")

    recommendations: list[str] = []
    if "S" in weak_criteria:
        recommendations.append("Сделайте формулировку более конкретной: добавьте ожидаемый результат.")
    if "M" in weak_criteria:
        recommendations.append("Добавьте числовой KPI или долю в процентах.")
    if "A" in weak_criteria:
        recommendations.append("Сверьте масштаб цели с историческими целями по аналогичной роли.")
    if "R" in weak_criteria:
        recommendations.append("Уточните связь цели с KPI подразделения или стратегией.")
    if "T" in weak_criteria:
        recommendations.append("Укажите конкретный срок выполнения (дата или квартал).")

    criteria_explanations = {
        "S": _criterion_explanation("S", score_s, weak_criteria, alignment_source),
        "M": _criterion_explanation("M", score_m, weak_criteria, alignment_source),
        "A": _criterion_explanation("A", score_a, weak_criteria, alignment_source),
        "R": _criterion_explanation("R", score_r, weak_criteria, alignment_source),
        "T": _criterion_explanation("T", score_t, weak_criteria, alignment_source),
    }

    rewrite = goal_text.strip()
    if smart_index < 0.7:
        suffix = "с числовым KPI и фиксированным дедлайном до конца квартала"
        rewrite = f"{goal_text.strip()} ({suffix})"

    return {
        "scores": {
            "S": round(score_s, 2),
            "M": round(score_m, 2),
            "A": round(score_a, 2),
            "R": round(score_r, 2),
            "T": round(score_t, 2),
        },
        "smart_index": smart_index,
        "criteria_explanations": criteria_explanations,
        "goal_type": goal_type,
        "alignment_level": alignment_level,
        "alignment_source": alignment_source,
        "weak_criteria": weak_criteria,
        "recommendations": recommendations,
        "rewrite": rewrite,
        "model_version": "rule-based-v1",
    }
