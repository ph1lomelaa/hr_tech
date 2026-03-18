from __future__ import annotations

import json
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from app.config import settings


_trace_write_lock = Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _truncate_text(value: str) -> str:
    max_chars = max(100, settings.ai_trace_max_chars)
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars]}... [truncated {len(value) - max_chars} chars]"


def _sanitize(value: Any) -> Any:
    if isinstance(value, str):
        return _truncate_text(value)
    if isinstance(value, dict):
        return {str(k): _sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize(v) for v in value]
    return value


def _trace_path() -> Path:
    path = Path(settings.ai_trace_log_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def trace_ai_event(event: str, payload: dict[str, Any]) -> None:
    entry = {
        "ts": _now_iso(),
        "event": event,
        "payload": _sanitize(payload),
    }
    path = _trace_path()
    line = json.dumps(entry, ensure_ascii=False) + "\n"
    with _trace_write_lock:
        with path.open("a", encoding="utf-8") as f:
            f.write(line)


def tail_ai_events(limit: int = 100, event: str | None = None) -> list[dict[str, Any]]:
    path = _trace_path()
    if not path.exists():
        return []

    parsed: deque[dict[str, Any]] = deque(maxlen=max(1, min(limit, 1000)))
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event and item.get("event") != event:
                continue
            parsed.append(item)

    limit = max(1, min(limit, 1000))
    return list(parsed)[-limit:]
