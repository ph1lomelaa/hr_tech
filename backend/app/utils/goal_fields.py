from __future__ import annotations

GOAL_STATUS_LABEL_RU: dict[str, str] = {
    "draft": "Черновик",
    "active": "Активна",
    "submitted": "На согласовании",
    "approved": "Утверждена",
    "in_progress": "В работе",
    "done": "Выполнена",
    "cancelled": "Отменена",
    "overdue": "Просрочена",
    "archived": "Архивирована",
}

_GOAL_STATUS_ALIASES: dict[str, str] = {
    "draft": "draft",
    "черновик": "draft",
    "active": "active",
    "submitted": "submitted",
    "pending": "submitted",
    "pending_approval": "submitted",
    "на_согласовании": "submitted",
    "на согласовании": "submitted",
    "approved": "approved",
    "утверждена": "approved",
    "in_progress": "in_progress",
    "in progress": "in_progress",
    "в_работе": "in_progress",
    "в работе": "in_progress",
    "done": "done",
    "выполнена": "done",
    "completed": "done",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "rejected": "cancelled",
    "отклонена": "cancelled",
    "overdue": "overdue",
    "archived": "archived",
}

QUARTER_VALUES = {"Q1", "Q2", "Q3", "Q4"}


def normalize_goal_status(value: str | None, default: str | None = None) -> str | None:
    if value is None:
        return default

    token = str(value).strip()
    if not token:
        return default

    normalized = _GOAL_STATUS_ALIASES.get(token.lower().replace("-", "_"))
    if normalized:
        return normalized

    raise ValueError(f"Unsupported goal status: {value}")


def status_label_ru(status_code: str | None) -> str | None:
    if not status_code:
        return None
    return GOAL_STATUS_LABEL_RU.get(status_code)


def legacy_status_code(
    status_code: str | None,
    review_verdict: str | None = None,
) -> str | None:
    """
    Совместимость с текущим фронтендом:
    - submitted -> pending
    - approved/in_progress/done/active -> approved
    - cancelled/overdue/archived -> rejected
    - draft + reject/needs_changes review -> rejected
    """
    if not status_code:
        return None

    verdict = (review_verdict or "").strip().lower()
    if status_code == "draft" and verdict in {"reject", "needs_changes"}:
        return "rejected"
    if status_code == "submitted":
        return "pending"
    if status_code in {"approved", "in_progress", "done", "active"}:
        return "approved"
    if status_code in {"cancelled", "overdue", "archived"}:
        return "rejected"
    return status_code


def normalize_quarter(value: str | None, default: str | None = None) -> str | None:
    if value is None:
        return default

    token = str(value).strip()
    if not token:
        return default

    upper = token.upper()
    if upper in {"Q1", "Q2", "Q3", "Q4"}:
        return upper

    raise ValueError(f"Unsupported quarter value: {value}")
