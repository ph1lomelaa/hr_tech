import json
import logging
from typing import Any

try:
    from anthropic import AsyncAnthropic
except Exception:  # pragma: no cover - optional dependency
    AsyncAnthropic = None  # type: ignore[assignment]

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_openai_client: AsyncOpenAI | None = None
_anthropic_client: Any | None = None


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


def _parse_json(raw: str) -> dict:
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("Empty LLM response")

    # Убираем ```json``` / ``` если модель добавила
    if "```" in raw:
        parts = [p.strip() for p in raw.split("```") if p.strip()]
        candidate = next((p for p in parts if "{" in p and "}" in p), parts[0])
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()
        raw = candidate

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Пытаемся вырезать первый JSON-объект из текста
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(raw[start : end + 1])
        raise


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


async def call_llm(prompt: str, temperature: float = 0.3) -> dict:
    """
    Универсальный вызов LLM.
    Приоритет: Anthropic Claude → OpenAI → заглушка.
    Возвращает распарсенный JSON.
    """
    # ── 1. Anthropic Claude ──────────────────────────────────────────────────
    if settings.anthropic_api_key and settings.anthropic_api_key not in ("", "sk-ant-..."):
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
            return _parse_json(raw)
        except Exception as e:
            logger.error(f"Anthropic call failed: {e}")

    # ── 2. OpenAI ────────────────────────────────────────────────────────────
    if settings.openai_api_key and settings.openai_api_key not in ("", "sk-..."):
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
            return _parse_json(raw)
        except Exception as e:
            logger.error(f"OpenAI call failed: {e}")

    # ── 3. Заглушка (нет ключей или оба упали) ───────────────────────────────
    logger.warning("No LLM API key configured or all calls failed — using stub")
    return _stub_response(prompt)


def _stub_response(prompt: str) -> dict:
    """Реалистичная заглушка для демо без API-ключа."""
    if "goals" in prompt:
        return {
            "goals": [
                {
                    "goal_text": "Сократить время обработки заявок с 5 до 3 рабочих дней к 30 июня 2026 г.",
                    "metric": "Среднее время обработки заявки (рабочих дней)",
                    "deadline": "2026-06-30",
                    "weight_suggestion": 30.0,
                    "smart_index": 0.85,
                    "goal_type": "output",
                    "source_doc_title": "ВНД-001 Стандарты обслуживания",
                    "source_quote": "Срок обработки входящих заявок не должен превышать 3 рабочих дней",
                    "generation_context": "Цель соответствует KPI подразделения по скорости обслуживания",
                },
                {
                    "goal_text": "Повысить удовлетворённость клиентов (NPS) с 62 до 72 баллов к концу Q2 2026",
                    "metric": "NPS (Net Promoter Score)",
                    "deadline": "2026-06-30",
                    "weight_suggestion": 35.0,
                    "smart_index": 0.88,
                    "goal_type": "impact",
                    "source_doc_title": "Стратегия клиентского сервиса 2026",
                    "source_quote": "Целевой показатель NPS на 2026 год — не ниже 70 баллов",
                    "generation_context": "Прямая связь со стратегическим приоритетом компании",
                },
                {
                    "goal_text": "Обучить 100% сотрудников команды новому регламенту работы до 1 мая 2026 г.",
                    "metric": "Доля обученных сотрудников (%)",
                    "deadline": "2026-05-01",
                    "weight_suggestion": 20.0,
                    "smart_index": 0.82,
                    "goal_type": "output",
                    "source_doc_title": "ВНД-015 Регламент обучения персонала",
                    "source_quote": "При введении нового регламента все сотрудники обязаны пройти обучение в течение 30 дней",
                    "generation_context": "Обязательное требование при внедрении нового процесса",
                },
            ],
        }
    if "scores" in prompt or "SMART" in prompt:
        return {
            "scores": {"S": 0.72, "M": 0.65, "A": 0.80, "R": 0.75, "T": 0.60},
            "smart_index": 0.70,
            "goal_type": "output",
            "alignment_level": "functional",
            "alignment_source": "Стратегия развития подразделения 2026",
            "weak_criteria": ["M", "T"],
            "recommendations": [
                "Добавьте числовой KPI для измерения результата",
                "Укажите конкретный срок выполнения",
            ],
            "rewrite": (
                "Улучшенная формулировка: добавлен числовой KPI и дедлайн "
                "[подключите ANTHROPIC_API_KEY или OPENAI_API_KEY для реального AI]"
            ),
        }
    return {
        "rewritten": "Переформулированная цель с KPI и дедлайном [stub mode]",
        "improvements": ["Добавлен KPI", "Добавлен дедлайн"],
    }
