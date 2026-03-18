from __future__ import annotations

import json


def _coerce_int(value: object) -> int | None:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def extract_department_scope_ids(raw_scope: object) -> list[int]:
    if raw_scope is None:
        return []

    if isinstance(raw_scope, str):
        text = raw_scope.strip()
        if not text:
            return []
        try:
            return extract_department_scope_ids(json.loads(text))
        except json.JSONDecodeError:
            values = []
            for part in text.split(","):
                coerced = _coerce_int(part.strip())
                if coerced is not None:
                    values.append(coerced)
            return list(dict.fromkeys(values))

    if isinstance(raw_scope, dict):
        ids = raw_scope.get("department_ids") or raw_scope.get("ids") or []
        if isinstance(ids, list):
            values = [_coerce_int(item) for item in ids]
            return [item for item in dict.fromkeys(values) if item is not None]
        return []

    if isinstance(raw_scope, list):
        values: list[int] = []
        for item in raw_scope:
            values.extend(extract_department_scope_ids(item))
        return list(dict.fromkeys(values))

    return []


def extract_department_scope_tokens(raw_scope: object) -> list[str]:
    if raw_scope is None:
        return []

    if isinstance(raw_scope, str):
        text = raw_scope.strip()
        if not text:
            return []
        try:
            return extract_department_scope_tokens(json.loads(text))
        except json.JSONDecodeError:
            return [part.strip() for part in text.split(",") if part.strip()]

    if isinstance(raw_scope, dict):
        tokens: list[str] = []
        for value in raw_scope.values():
            tokens.extend(extract_department_scope_tokens(value))
        return list(dict.fromkeys(tokens))

    if isinstance(raw_scope, list):
        tokens: list[str] = []
        for item in raw_scope:
            tokens.extend(extract_department_scope_tokens(item))
        return list(dict.fromkeys(tokens))

    text = str(raw_scope).strip()
    return [text] if text else []


def department_scope_matches(
    raw_scope: object,
    *,
    department_ids: list[int] | None = None,
    aliases: list[str] | None = None,
) -> bool:
    if raw_scope is None:
        return True

    normalized_department_ids = [item for item in (department_ids or []) if item is not None]
    scope_ids = set(extract_department_scope_ids(raw_scope))
    if scope_ids and normalized_department_ids:
        return bool(scope_ids & set(normalized_department_ids))

    scope_tokens = [
        " ".join(token.replace("_", " ").replace("-", " ").lower().split())
        for token in extract_department_scope_tokens(raw_scope)
        if str(token).strip()
    ]
    alias_tokens = [
        " ".join(alias.replace("_", " ").replace("-", " ").lower().split())
        for alias in (aliases or [])
        if str(alias).strip()
    ]

    if not scope_tokens:
        return not scope_ids or not normalized_department_ids

    for alias in alias_tokens:
        alias_parts = set(alias.split())
        for scope in scope_tokens:
            if alias == scope or alias in scope or scope in alias:
                return True
            scope_parts = set(scope.split())
            if alias_parts and scope_parts and (alias_parts & scope_parts):
                return True

    if scope_ids and normalized_department_ids:
        return False

    return not scope_ids and not scope_tokens


def scope_metadata(raw_scope: object) -> dict[str, str]:
    return {
        "department_scope": json.dumps(raw_scope, ensure_ascii=False, sort_keys=True) if raw_scope is not None else "",
        "department_scope_ids": ",".join(str(item) for item in extract_department_scope_ids(raw_scope)),
    }
