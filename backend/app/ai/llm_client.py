import json
import logging

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_openai_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


async def call_llm(prompt: str, temperature: float = 0.3) -> dict:
    """
    Универсальный вызов LLM. Возвращает распарсенный JSON.
    Если нет OpenAI ключа — возвращает заглушку для тестирования.
    """
    if not settings.openai_api_key or settings.openai_api_key == "sk-...":
        logger.warning("OpenAI API key not set, returning stub response")
        return _stub_response(prompt)

    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {
                    "role": "system",
                    "content": "Ты эксперт по HR и управлению эффективностью. Всегда отвечай только валидным JSON."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return _stub_response(prompt)


def _stub_response(prompt: str) -> dict:
    """
    Заглушка для работы без LLM ключа.
    Возвращает реалистичные данные для тестирования.
    """
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
                "Укажите конкретный срок выполнения"
            ],
            "rewrite": "Улучшенная формулировка с числовым KPI и дедлайном [заглушка — подключите OpenAI]"
        }
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
                    "generation_context": "Цель соответствует KPI подразделения по скорости обслуживания"
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
                    "generation_context": "Прямая связь со стратегическим приоритетом компании"
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
                    "generation_context": "Обязательное требование при внедрении нового процесса"
                }
            ]
        }
    return {"rewritten": "Переформулированная цель [заглушка]", "improvements": ["Добавлен KPI", "Добавлен дедлайн"]}
