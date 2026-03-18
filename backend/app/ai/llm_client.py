import json
import logging
import ast
import hashlib
import re
import time
from collections import OrderedDict
from typing import Any

import httpx

try:
    from anthropic import AsyncAnthropic
except Exception:  # pragma: no cover - optional dependency
    AsyncAnthropic = None  # type: ignore[assignment]

from openai import AsyncOpenAI

from app.config import settings
from app.utils.ai_trace import trace_ai_event

logger = logging.getLogger(__name__)

_openai_client: AsyncOpenAI | None = None
_anthropic_client: Any | None = None
_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_LLM_CACHE: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
_PROVIDER_STATE: dict[str, dict[str, float | int]] = {
    "anthropic": {"failures": 0, "cooldown_until": 0.0},
    "gemini": {"failures": 0, "cooldown_until": 0.0},
    "openai": {"failures": 0, "cooldown_until": 0.0},
}
_TRAILING_COMMA_RE = re.compile(r",(?=\s*[}\]])")
_BARE_KEY_RE = re.compile(r'([{\[,]\s*)([A-Za-z_][A-Za-z0-9_\-]*)(\s*:)')
_JSON_CANDIDATE_RE = re.compile(r"\{.*\}", re.S)


def get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


def get_anthropic_client() -> Any:
    global _anthropic_client
    if AsyncAnthropic is None:
        raise RuntimeError("anthropic package is not installed")
    if _anthropic_client is None:
        _anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


def _trace_error_payload(
    *,
    provider: str,
    model: str,
    error: str,
    raw: str | None = None,
) -> None:
    payload: dict[str, Any] = {
        "provider": provider,
        "model": model,
        "error": error,
    }
    if raw:
        payload["raw"] = raw[: min(settings.ai_trace_max_chars, 2000)]
    trace_ai_event("llm.error", payload)


def _cache_key(prompt: str, temperature: float) -> str:
    digest = hashlib.sha256(f"{temperature:.3f}\n{prompt}".encode("utf-8")).hexdigest()
    return digest


def _clone_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(payload, ensure_ascii=False))


def _attach_provider_meta(payload: dict[str, Any], *, provider: str, model: str) -> dict[str, Any]:
    enriched = dict(payload)
    enriched["_llm_provider"] = provider
    enriched["_llm_model"] = model
    return enriched


def _read_cache(cache_key: str) -> dict[str, Any] | None:
    ttl = max(0, settings.llm_cache_ttl_seconds)
    if ttl <= 0:
        return None

    now = time.monotonic()
    cached = _LLM_CACHE.get(cache_key)
    if cached is None:
        return None

    expires_at, payload = cached
    if expires_at <= now:
        _LLM_CACHE.pop(cache_key, None)
        return None

    _LLM_CACHE.move_to_end(cache_key)
    return _clone_payload(payload)


def _write_cache(cache_key: str, payload: dict[str, Any]) -> None:
    ttl = max(0, settings.llm_cache_ttl_seconds)
    max_entries = max(1, settings.llm_cache_max_entries)
    if ttl <= 0:
        return

    _LLM_CACHE[cache_key] = (time.monotonic() + ttl, _clone_payload(payload))
    _LLM_CACHE.move_to_end(cache_key)
    while len(_LLM_CACHE) > max_entries:
        _LLM_CACHE.popitem(last=False)


def _provider_available(provider: str) -> bool:
    state = _PROVIDER_STATE[provider]
    return time.monotonic() >= float(state["cooldown_until"])


def _mark_provider_success(provider: str) -> None:
    state = _PROVIDER_STATE[provider]
    state["failures"] = 0
    state["cooldown_until"] = 0.0


def _mark_provider_failure(provider: str, *, force_cooldown: bool = False) -> None:
    state = _PROVIDER_STATE[provider]
    failures = int(state["failures"]) + 1
    state["failures"] = failures
    threshold = max(1, settings.llm_provider_failure_threshold)
    if force_cooldown or failures >= threshold:
        state["cooldown_until"] = time.monotonic() + max(1, settings.llm_provider_cooldown_seconds)
        state["failures"] = 0


def _extract_json_candidate(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return text
    if "```" in text:
        parts = [p.strip() for p in text.split("```") if p.strip()]
        candidate = next((p for p in parts if "{" in p and "}" in p), parts[0])
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()
        text = candidate
    match = _JSON_CANDIDATE_RE.search(text)
    return match.group(0).strip() if match else text


def _sanitize_candidate(candidate: str) -> str:
    text = candidate.strip()
    if not text:
        return text
    replacements = {
        "\u201c": '"',
        "\u201d": '"',
        "\u2018": "'",
        "\u2019": "'",
        "\u00a0": " ",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    text = _TRAILING_COMMA_RE.sub("", text)
    text = _BARE_KEY_RE.sub(r'\1"\2"\3', text)
    return text


def _parse_via_literal_eval(candidate: str) -> dict[str, Any] | None:
    py_candidate = candidate
    py_candidate = re.sub(r"\bnull\b", "None", py_candidate, flags=re.IGNORECASE)
    py_candidate = re.sub(r"\btrue\b", "True", py_candidate, flags=re.IGNORECASE)
    py_candidate = re.sub(r"\bfalse\b", "False", py_candidate, flags=re.IGNORECASE)
    try:
        parsed = ast.literal_eval(py_candidate)
    except Exception:
        return None
    if isinstance(parsed, dict):
        return _clone_payload(parsed)
    return None


def _parse_json(raw: str) -> dict[str, Any]:
    candidate = _extract_json_candidate(raw)
    if not candidate:
        raise ValueError("Empty LLM response")

    attempts = [candidate]
    sanitized = _sanitize_candidate(candidate)
    if sanitized != candidate:
        attempts.append(sanitized)

    last_error: Exception | None = None
    for attempt in attempts:
        try:
            parsed = json.loads(attempt)
            if isinstance(parsed, dict):
                return parsed
            raise ValueError("LLM JSON root must be an object")
        except Exception as exc:
            last_error = exc

    literal_parsed = _parse_via_literal_eval(sanitized)
    if literal_parsed is not None:
        return literal_parsed

    if last_error is not None:
        raise last_error
    raise ValueError("Unable to parse LLM JSON response")


def _anthropic_text(response: Any) -> str:
    content = getattr(response, "content", None)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        texts: list[str] = []
        for block in content:
            if hasattr(block, "text"):
                texts.append(block.text)
            elif isinstance(block, dict) and block.get("type") == "text":
                texts.append(block.get("text", ""))
        return "".join(texts).strip()
    return ""


def _gemini_text(response: dict[str, Any]) -> str:
    candidates = response.get("candidates") or []
    if not candidates:
        return ""
    content = (candidates[0] or {}).get("content") or {}
    parts = content.get("parts") or []
    texts: list[str] = []
    for part in parts:
        if isinstance(part, dict) and part.get("text"):
            texts.append(str(part["text"]))
    return "".join(texts).strip()


async def _call_gemini(prompt: str, temperature: float) -> dict:
    url = f"{_GEMINI_BASE_URL}/models/{settings.gemini_model}:generateContent"
    payload = {
        "systemInstruction": {
            "parts": [
                {
                    "text": (
                        "Ты эксперт по HR и управлению эффективностью. "
                        "Всегда отвечай только валидным JSON. "
                        "Используй только двойные кавычки, без trailing commas и без markdown."
                    )
                }
            ]
        },
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
        },
    }
    headers = {
        "x-goog-api-key": settings.api_key,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=max(5.0, float(settings.llm_request_timeout_seconds))) as client:
        response = await client.post(url, headers=headers, json=payload)
    if response.is_error:
        _trace_error_payload(
            provider="gemini",
            model=settings.gemini_model,
            error=f"HTTP {response.status_code}",
            raw=response.text,
        )
        raise RuntimeError(f"Gemini HTTP {response.status_code}: {response.text[:500]}")
    data = response.json()
    raw = _gemini_text(data)
    if not raw:
        _trace_error_payload(
            provider="gemini",
            model=settings.gemini_model,
            error="empty_text",
            raw=str(data),
        )
        raise ValueError(f"Gemini returned empty text: {str(data)[:300]}")
    try:
        parsed = _parse_json(raw)
    except Exception as exc:
        _trace_error_payload(
            provider="gemini",
            model=settings.gemini_model,
            error=str(exc),
            raw=raw,
        )
        raise
    trace_ai_event(
        "llm.response",
        {
            "provider": "gemini",
            "model": settings.gemini_model,
            "raw": raw,
            "parsed": parsed,
        },
    )
    return parsed


async def call_llm(prompt: str, temperature: float = 0.3) -> dict:
    """
    Универсальный вызов LLM.
    Приоритет: Anthropic Claude → Gemini → OpenAI.
    Возвращает распарсенный JSON.
    """
    trace_ai_event(
        "llm.request",
        {
            "temperature": temperature,
            "prompt": prompt,
            "providers": {
                "anthropic": bool(settings.anthropic_api_key and settings.anthropic_api_key not in ("", "sk-ant-...")),
                "gemini": bool(settings.api_key and settings.api_key not in ("", "AIza...")),
                "openai": bool(settings.openai_api_key and settings.openai_api_key not in ("", "sk-...")),
            },
        },
    )
    cache_key = _cache_key(prompt, temperature)
    cached = _read_cache(cache_key)
    if cached is not None:
        trace_ai_event(
            "llm.cache_hit",
            {
                "temperature": temperature,
                "cache_key": cache_key[:12],
            },
        )
        return cached

    # ── 1. Anthropic Claude ──────────────────────────────────────────────────
    if (
        settings.anthropic_api_key
        and settings.anthropic_api_key not in ("", "sk-ant-...")
        and _provider_available("anthropic")
    ):
        try:
            client = get_anthropic_client()
            response = await client.messages.create(
                model=settings.anthropic_model,
                max_tokens=2048,
                temperature=temperature,
                system=(
                    "Ты эксперт по HR и управлению эффективностью персонала. "
                    "Всегда отвечай только валидным JSON без markdown-обёртки."
                ),
                messages=[{"role": "user", "content": prompt}],
            )
            raw = _anthropic_text(response)
            parsed = _parse_json(raw)
            trace_ai_event(
                "llm.response",
                {
                    "provider": "anthropic",
                    "model": settings.anthropic_model,
                    "raw": raw,
                    "parsed": parsed,
                },
            )
            enriched = _attach_provider_meta(parsed, provider="anthropic", model=settings.anthropic_model)
            _mark_provider_success("anthropic")
            _write_cache(cache_key, enriched)
            return enriched
        except Exception as e:
            logger.error(f"Anthropic call failed: {e}")
            _mark_provider_failure("anthropic", force_cooldown=isinstance(e, (ValueError, json.JSONDecodeError)))
            _trace_error_payload(
                provider="anthropic",
                model=settings.anthropic_model,
                error=str(e),
            )
    elif settings.anthropic_api_key and settings.anthropic_api_key not in ("", "sk-ant-..."):
        trace_ai_event(
            "llm.provider_skipped",
            {"provider": "anthropic", "reason": "cooldown"},
        )

    # ── 2. Google Gemini ─────────────────────────────────────────────────────
    if (
        settings.api_key
        and settings.api_key not in ("", "AIza...")
        and _provider_available("gemini")
    ):
        try:
            parsed = await _call_gemini(prompt=prompt, temperature=temperature)
            enriched = _attach_provider_meta(parsed, provider="gemini", model=settings.gemini_model)
            _mark_provider_success("gemini")
            _write_cache(cache_key, enriched)
            return enriched
        except Exception as e:
            logger.error(f"Gemini call failed: {e}")
            _mark_provider_failure("gemini", force_cooldown=isinstance(e, (ValueError, json.JSONDecodeError)))
            _trace_error_payload(
                provider="gemini",
                model=settings.gemini_model,
                error=str(e),
            )
    elif settings.api_key and settings.api_key not in ("", "AIza..."):
        trace_ai_event(
            "llm.provider_skipped",
            {"provider": "gemini", "reason": "cooldown"},
        )

    # ── 3. OpenAI ────────────────────────────────────────────────────────────
    if (
        settings.openai_api_key
        and settings.openai_api_key not in ("", "sk-...")
        and _provider_available("openai")
    ):
        try:
            client = get_openai_client()
            response = await client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Ты эксперт по HR и управлению эффективностью. "
                            "Всегда отвечай только валидным JSON."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
                response_format={"type": "json_object"},
            )
            raw = response.choices[0].message.content or ""
            parsed = _parse_json(raw)
            trace_ai_event(
                "llm.response",
                {
                    "provider": "openai",
                    "model": settings.openai_model,
                    "raw": raw,
                    "parsed": parsed,
                },
            )
            enriched = _attach_provider_meta(parsed, provider="openai", model=settings.openai_model)
            _mark_provider_success("openai")
            _write_cache(cache_key, enriched)
            return enriched
        except Exception as e:
            logger.error(f"OpenAI call failed: {e}")
            _mark_provider_failure("openai", force_cooldown=isinstance(e, (ValueError, json.JSONDecodeError)))
            _trace_error_payload(
                provider="openai",
                model=settings.openai_model,
                error=str(e),
            )
    elif settings.openai_api_key and settings.openai_api_key not in ("", "sk-..."):
        trace_ai_event(
            "llm.provider_skipped",
            {"provider": "openai", "reason": "cooldown"},
        )

    logger.error("No LLM API key configured or all provider calls failed")
    trace_ai_event(
        "llm.error",
        {"provider": "none", "error": "no_provider_available"},
    )
    raise RuntimeError(
        "LLM provider unavailable: set API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY and verify connectivity"
    )
