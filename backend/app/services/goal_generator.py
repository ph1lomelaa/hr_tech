import uuid
import logging
import re
from datetime import date
from difflib import SequenceMatcher

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_client import call_llm
from app.ai.prompts import GENERATE_GOALS_PROMPT, REWRITE_GOAL_PROMPT
from app.models.hr_models import (
    Document,
    Employee,
    Goal,
    GoalEvent,
    KpiCatalog,
    KpiTimeseries,
)
from app.models.ai_models import GenerationSession, GoalSource, SuggestedGoal
from app.services.rag_service import build_department_aliases, format_vnd_context, get_relevant_vnd
from app.services.goal_quality_rules import (
    create_alert_if_absent,
    find_goal_duplicates,
    normalize_goal_text,
    validate_goal_set_constraints,
)
from app.services.smart_evaluator import evaluate_goal
from app.utils.citation import (
    attach_reference_to_quote,
    format_source_reference,
    infer_paragraph_span,
    infer_section_from_text,
)
from app.utils.ai_trace import trace_ai_event
from app.utils.document_scope import department_scope_matches
from app.schemas.generation import (
    GenerateGoalsResponse,
    SuggestedGoalItem,
    RewriteGoalResponse,
)
from app.config import settings

logger = logging.getLogger(__name__)
_SOURCE_REF_RE = re.compile(r"^\s*DOC(\d+)\s*$", re.IGNORECASE)


def _quarter_deadline(quarter: str, year: int) -> date:
    mapping = {
        "Q1": (3, 31),
        "Q2": (6, 30),
        "Q3": (9, 30),
        "Q4": (12, 31),
    }
    month, day = mapping.get((quarter or "").upper(), (12, 31))
    return date(year, month, day)


def _doc_topic(doc: Document) -> str:
    title = (doc.title or "").strip()
    if ":" in title:
        title = title.split(":", 1)[1].strip()
    if "—" in title:
        title = title.split("—", 1)[0].strip()
    if title:
        return title
    if doc.keywords:
        return str(doc.keywords[0]).strip()
    return "операционная эффективность"


def _topic_goal_payload(
    *,
    topic: str,
    department_prompt: str,
    deadline: date,
    focus_direction: str | None,
    manager_goal: str | None = None,
) -> dict:
    topic_lc = f"{topic} {focus_direction or ''}".lower()

    if any(token in topic_lc for token in ("sla", "инцид", "service", "тикет", "эксплуатац", "support")):
        metric = "Соблюдение SLA, %"
        action = (
            f"повысить соблюдение SLA по направлению \"{topic}\" до 95% "
            f"и сократить среднее время реакции на обращения не менее чем на 20%"
        )
    elif any(token in topic_lc for token in ("безопас", "доступ", "audit", "rbac", "waf", "ldap", "phishing", "комплаенс")):
        metric = "Закрытие критичных замечаний ИБ, %"
        action = (
            f"закрыть 100% критичных замечаний по направлению \"{topic}\" "
            f"и сократить срок устранения остальных замечаний до 5 рабочих дней"
        )
    elif any(token in topic_lc for token in ("данн", "etl", "bi", "аналит", "качество", "metabase", "power bi")):
        metric = "Доля данных без ошибок, %"
        action = (
            f"повысить качество данных по направлению \"{topic}\" до 97% "
            f"и сократить количество ошибок в витринах/отчётности не менее чем на 20%"
        )
    elif any(token in topic_lc for token in ("релиз", "devops", "observability", "monitor", "архитект", "ddd", "nfr")):
        metric = "Доля успешных релизов, %"
        action = (
            f"повысить долю успешных релизов по направлению \"{topic}\" до 95% "
            f"и сократить число инцидентов после релиза не менее чем на 15%"
        )
    elif any(token in topic_lc for token in ("цифров", "автомат", "интеграц", "api", "esb", "микросервис")):
        metric = "Доля автоматизированных операций, %"
        action = (
            f"увеличить долю автоматизированных операций по направлению \"{topic}\" до 70% "
            f"и сократить ручные трудозатраты не менее чем на 15%"
        )
    elif any(token in topic_lc for token in ("затрат", "эффектив", "оптимизац")):
        metric = "Экономия трудозатрат, %"
        action = (
            f"снизить трудозатраты по направлению \"{topic}\" не менее чем на 12% "
            f"без ухудшения качества сервиса"
        )
    else:
        metric = "Выполнение целевого показателя, %"
        action = (
            f"обеспечить выполнение целевого показателя по направлению \"{topic}\" "
            f"не ниже 90% и подготовить подтверждающий отчёт по результатам периода"
        )

    if manager_goal:
        manager_fragment = " ".join(manager_goal.split())[:180]
        goal_text = (
            f"До {deadline.isoformat()} обеспечить вклад в цель руководителя "
            f"\"{manager_fragment}\" через результат: {action} в подразделении \"{department_prompt}\"."
        )
        generation_context = (
            f"Цель каскадирована от цели руководителя и опирается на тему \"{topic}\"."
        )
    else:
        goal_text = (
            f"До {deadline.isoformat()} {action} в подразделении \"{department_prompt}\" "
            f"с ежемесячным мониторингом результата."
        )
        generation_context = (
            f"Цель сформирована по теме \"{topic}\" для подразделения \"{department_prompt}\"."
        )

    return {
        "goal_text": goal_text,
        "metric": metric,
        "deadline": deadline.isoformat(),
        "weight_suggestion": round(100 / max(settings.min_goals, 3), 2),
        "generation_context": generation_context,
    }


def _parse_kpi_context_line(kpi_context: str) -> tuple[str, str | None, str | None] | None:
    if not kpi_context or "не найдены" in kpi_context.lower():
        return None
    first_line = next((line.strip() for line in kpi_context.splitlines() if line.strip()), "")
    if not first_line:
        return None
    match = re.match(r"^\[\d+\]\s+(.*?):\s+([0-9.,-]+)\s*(.*?)\s+\((.*?)\)\s*$", first_line)
    if not match:
        return None
    name = match.group(1).strip()
    value = match.group(2).strip()
    unit = match.group(3).strip() or None
    return name, value, unit


def _offline_generate_goals(
    *,
    position: str,
    department_prompt: str,
    quarter: str,
    year: int,
    focus_direction: str | None,
    manager_goals_list: list[str],
    fallback_docs: list[Document],
    kpi_context: str,
) -> list[dict]:
    deadline = _quarter_deadline(quarter, year)
    raw_goals: list[dict] = []
    seen: set[str] = set()

    kpi_target = _parse_kpi_context_line(kpi_context)
    if kpi_target:
        name, value, unit = kpi_target
        unit_suffix = f" {unit}" if unit else ""
        text = (
            f"До {deadline.isoformat()} улучшить KPI \"{name}\" для роли \"{position}\" "
            f"в подразделении \"{department_prompt}\" не менее чем на 10% "
            f"относительно базового значения {value}{unit_suffix}."
        )
        raw_goals.append(
            {
                "goal_text": text,
                "metric": f"{name}{unit_suffix}",
                "deadline": deadline.isoformat(),
                "weight_suggestion": round(100 / max(settings.min_goals, 3), 2),
                "generation_context": "Цель сформирована на основе KPI подразделения.",
            }
        )
        seen.add(text)

    topics: list[tuple[str, Document | None]] = []
    if focus_direction:
        topics.append((focus_direction.strip(), None))
    for doc in fallback_docs:
        topic = _doc_topic(doc)
        if topic:
            topics.append((topic, doc))

    if not topics:
        topics = [("операционная эффективность", None), ("качество сервиса", None), ("исполнение требований ВНД", None)]

    manager_iter = iter(manager_goals_list)
    for topic, doc in topics:
        if len(raw_goals) >= settings.max_goals:
            break
        payload = _topic_goal_payload(
            topic=topic,
            department_prompt=department_prompt,
            deadline=deadline,
            focus_direction=focus_direction,
            manager_goal=next(manager_iter, None),
        )
        if payload["goal_text"] in seen:
            continue
        if doc is not None:
            payload["source_doc_title"] = doc.title
            payload["source_quote"] = (doc.content or "").strip()[:260]
        raw_goals.append(payload)
        seen.add(payload["goal_text"])

    fallback_topics = (
        "качество сервиса",
        "снижение операционных рисков",
        "исполнение требований ВНД",
        "прозрачность KPI",
    )
    for topic in fallback_topics:
        if len(raw_goals) >= settings.min_goals:
            break
        payload = _topic_goal_payload(
            topic=topic,
            department_prompt=department_prompt,
            deadline=deadline,
            focus_direction=focus_direction,
        )
        if payload["goal_text"] in seen:
            continue
        raw_goals.append(payload)
        seen.add(payload["goal_text"])

    return raw_goals[: settings.max_goals]


def _offline_rewrite_goal(goal_text: str, weak_criteria: list[str] | None, quarter: str, year: int) -> dict:
    weak = list(weak_criteria or [])
    deadline = _quarter_deadline(quarter, year).isoformat()
    rewritten = " ".join(goal_text.split()).strip().rstrip(".")
    improvements: list[str] = []

    if "S" in weak and "результат" not in rewritten.lower():
        rewritten += " с чётко определённым результатом"
        improvements.append("Добавлен явный ожидаемый результат.")
    if "M" in weak and not re.search(r"\d|%", rewritten):
        rewritten += " не менее чем на 10%"
        improvements.append("Добавлен измеримый числовой ориентир.")
    if "T" in weak and deadline not in rewritten:
        rewritten = f"До {deadline} {rewritten[:1].lower() + rewritten[1:]}"
        improvements.append("Добавлен конкретный срок выполнения.")
    if "R" in weak and "KPI подразделения" not in rewritten:
        rewritten += " в связке с KPI подразделения"
        improvements.append("Уточнена связка с задачами подразделения.")
    if "A" in weak and "в зоне ответственности" not in rewritten:
        rewritten += " в зоне ответственности роли"
        improvements.append("Сформулирован реалистичный контур выполнения.")

    if not improvements:
        rewritten += f" до {deadline} с числовым KPI не ниже 90%"
        improvements.append("Добавлены срок и целевой KPI.")

    return {
        "rewritten": rewritten.strip() + ".",
        "improvements": improvements,
    }


async def _load_fallback_documents(
    db: AsyncSession,
    department: str | None,
    department_code: str | None,
    department_id: int | None,
    focus_direction: str | None,
    limit: int = 5,
) -> list[Document]:
    """
    Fallback documents used when vector RAG is unavailable.
    Prioritizes documents that mention department/focus in metadata/title.
    """
    stmt = select(Document).where(Document.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    docs = result.scalars().all()
    if not docs:
        return []

    department_aliases = build_department_aliases(department=department, department_code=department_code)
    department_aliases_lc = [str(v).strip().lower() for v in department_aliases if str(v).strip()]
    focus_lc = (focus_direction or "").strip().lower()
    type_priority = {"strategy": 0, "kpi_framework": 1, "vnd": 2, "policy": 3}

    def score(doc: Document) -> tuple[int, int, int]:
        title = (doc.title or "").lower()
        keywords = [str(v).lower() for v in (doc.keywords or [])]

        dept_hit = int(
            department_scope_matches(
                doc.department_scope,
                aliases=department_aliases_lc,
                department_ids=[department_id] if department_id is not None else None,
            )
            or any(alias in title for alias in department_aliases_lc)
            or any(any(alias in val for alias in department_aliases_lc) for val in keywords)
        )

        focus_hit = 0
        if focus_lc:
            focus_hit = int(
                focus_lc in title
                or any(focus_lc in val for val in keywords)
            )

        doc_type_rank = type_priority.get(doc.doc_type, 99)
        return (-dept_hit, -focus_hit, doc_type_rank)

    docs_sorted = sorted(docs, key=score)
    return docs_sorted[:limit]


async def _load_kpi_context(
    db: AsyncSession,
    department_id: int | None,
    year: int | None,
    limit: int = 5,
) -> str:
    if department_id is None:
        return "KPI подразделения не найдены."

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
        return "KPI подразделения не найдены."

    lines: list[str] = []
    for idx, (name, unit, period, value) in enumerate(rows, start=1):
        unit_part = f" {unit}" if unit else ""
        lines.append(f"[{idx}] {name}: {value}{unit_part} ({period})")
    return "\n".join(lines)


def _intra_duplicate_matches(goal_text: str, previous_texts: list[str]) -> list[str]:
    query = normalize_goal_text(goal_text)
    matches: list[str] = []
    for candidate in previous_texts:
        score = SequenceMatcher(None, query, normalize_goal_text(candidate)).ratio()
        if score >= settings.duplicate_similarity_threshold:
            matches.append(candidate)
    return matches[:2]


def _infer_alignment_from_doc_type(doc_type: str | None) -> str | None:
    if not doc_type:
        return None
    mapping = {
        "strategy": "strategic",
        "kpi_framework": "functional",
        "vnd": "operational",
        "policy": "operational",
        "regulation": "operational",
        "instruction": "operational",
        "standard": "operational",
    }
    return mapping.get(doc_type)


def _normalize_llm_goals(raw_goals: object) -> list[dict]:
    if not isinstance(raw_goals, list):
        return []
    goals: list[dict] = []
    seen: set[str] = set()
    for raw in raw_goals:
        if not isinstance(raw, dict):
            continue
        goal_text = " ".join(str(raw.get("goal_text", "")).split()).strip()
        if not goal_text or goal_text in seen:
            continue
        seen.add(goal_text)
        item = dict(raw)
        item["goal_text"] = goal_text
        goals.append(item)
    return goals


def _parse_source_ref(value: object) -> int | None:
    if not isinstance(value, str):
        return None
    match = _SOURCE_REF_RE.match(value)
    if not match:
        return None
    return int(match.group(1))


def _source_ref_for_index(index: int) -> str:
    return f"DOC{index + 1}"


def _select_chunk_by_source_ref(chunks: list[dict], source_ref: object) -> tuple[dict | None, str | None]:
    ref_num = _parse_source_ref(source_ref)
    if ref_num is None:
        return None, None
    index = ref_num - 1
    if index < 0 or index >= len(chunks):
        return None, None
    return chunks[index], _source_ref_for_index(index)


def _safe_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


async def generate_goals(
    employee_id: int,
    quarter: str,
    year: int,
    focus_direction: str | None,
    include_manager_goals: bool,
    db: AsyncSession,
) -> GenerateGoalsResponse:
    trace_ai_event(
        "generate.request",
        {
            "employee_id": str(employee_id),
            "quarter": quarter,
            "year": year,
            "focus_direction": focus_direction,
            "include_manager_goals": include_manager_goals,
        },
    )

    # 1. Загружаем профиль сотрудника
    emp_result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.department))
        .where(Employee.id == employee_id)
    )
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise ValueError(f"Employee {employee_id} not found")

    position = employee.position.name if employee.position else "Сотрудник"
    department_name = employee.department.name if employee.department else "Подразделение"
    department_code = employee.department.code if employee.department else None
    department_id = employee.department_id
    department_prompt = (
        f"{department_name} ({department_code})"
        if department_code
        else department_name
    )

    # 2. Цели руководителя (каскадирование)
    manager_goals_text = "Нет данных о целях руководителя"
    manager_goals_list = []
    if include_manager_goals and employee.manager_id:
        mgr_result = await db.execute(
            select(Goal).where(
                Goal.employee_id == employee.manager_id,
                Goal.quarter == quarter,
                Goal.year == year,
                Goal.status != "draft",
            )
        )
        manager_goals = mgr_result.scalars().all()
        if manager_goals:
            manager_goals_list = [g.goal_text or g.title for g in manager_goals]
            manager_goals_text = "\n".join(f"- {g}" for g in manager_goals_list)

    kpi_context = await _load_kpi_context(
        db=db,
        department_id=department_id,
        year=year,
    )

    # 3. RAG — релевантные ВНД
    chunks = await get_relevant_vnd(
        position=position,
        department=department_name,
        focus_direction=focus_direction,
        db=db,
        department_code=department_code,
        department_id=department_id,
    )
    fallback_docs = await _load_fallback_documents(
        db=db,
        department=department_name,
        department_code=department_code,
        department_id=department_id,
        focus_direction=focus_direction,
        limit=settings.max_goals,
    )
    if not chunks:
        generation_hint = (
            "RAG не вернул релевантные чанки из ChromaDB. "
            "Использованы fallback-документы из SQL-базы."
        )
        logger.warning(generation_hint)
    else:
        generation_hint = ""
    vnd_context = format_vnd_context(chunks)

    # 4. Генерация через LLM
    from datetime import date
    prompt = GENERATE_GOALS_PROMPT.format(
        count=settings.max_goals,
        position=position,
        department=department_prompt,
        quarter=quarter,
        year=year,
        current_date=date.today().isoformat(),
        focus_direction=focus_direction or "не задано",
        manager_goals=manager_goals_text,
        vnd_context=vnd_context,
        kpi_context=kpi_context,
    )

    llm_warning: str | None = None
    try:
        llm_result = await call_llm(prompt, temperature=0.5)
        raw_goals = _normalize_llm_goals(llm_result.get("goals"))

        if len(raw_goals) < settings.min_goals:
            retry_prompt = (
                f"{prompt}\n\n"
                f"Критично: верни от {settings.min_goals} до {settings.max_goals} целей."
            )
            retry_result = await call_llm(retry_prompt, temperature=0.4)
            raw_goals = _normalize_llm_goals(retry_result.get("goals"))

        if len(raw_goals) > settings.max_goals:
            raw_goals = raw_goals[:settings.max_goals]
        if len(raw_goals) < settings.min_goals:
            raise ValueError(
                f"LLM returned {len(raw_goals)} goals, expected {settings.min_goals}-{settings.max_goals}"
            )
    except Exception as exc:
        logger.warning("LLM generation unavailable, switching to offline generator: %s", exc)
        llm_warning = (
            "LLM недоступна: использован офлайн-генератор на основе KPI, целей руководителя и документов."
        )
        raw_goals = _offline_generate_goals(
            position=position,
            department_prompt=department_prompt,
            quarter=quarter,
            year=year,
            focus_direction=focus_direction,
            manager_goals_list=manager_goals_list,
            fallback_docs=fallback_docs,
            kpi_context=kpi_context,
        )
        if len(raw_goals) < settings.min_goals:
            raise ValueError(
                f"Offline generator returned {len(raw_goals)} goals, expected at least {settings.min_goals}"
            )

    # 5. Сохраняем сессию
    session = GenerationSession(
        employee_id=employee_id,
        quarter=quarter,
        year=year,
        focus_direction=focus_direction,
        manager_goals={"goals": manager_goals_list},
    )
    db.add(session)
    await db.flush()

    # 6. Обрабатываем каждую сгенерированную цель
    suggestions = []
    generation_warnings: list[str] = [generation_hint] if generation_hint else []
    if llm_warning:
        generation_warnings.append(llm_warning)
    if kpi_context == "KPI подразделения не найдены.":
        generation_warnings.append(
            "KPI подразделения не найдены: генерация выполнена на основе ВНД и целей руководителя."
        )
    duplicate_alert_messages: list[str] = []
    accepted_texts: list[str] = []
    document_content_cache: dict[uuid.UUID, str] = {
        doc.doc_id: (doc.content or "")
        for doc in fallback_docs
    }
    for raw in raw_goals:
        goal_text = raw.get("goal_text", "")
        if not goal_text:
            continue

        # SMART-оценка (компонент A) для каждой цели
        eval_result = await evaluate_goal(
            goal_text=goal_text,
            position=position,
            department=department_name,
            employee_id=employee_id,
            quarter=quarter,
            year=year,
            db=db,
            prefer_rule_based=True,
        )

        # Если SMART < порога — переформулируем и переоцениваем
        if eval_result.smart_index < settings.smart_threshold:
            try:
                rewrite_result = await call_llm(
                    REWRITE_GOAL_PROMPT.format(
                        goal_text=goal_text,
                        position=position,
                        department=department_name,
                        weak_criteria=", ".join(eval_result.weak_criteria),
                    )
                )
            except Exception as exc:
                logger.warning("LLM rewrite unavailable, switching to offline rewrite: %s", exc)
                rewrite_result = _offline_rewrite_goal(
                    goal_text=goal_text,
                    weak_criteria=eval_result.weak_criteria,
                    quarter=quarter,
                    year=year,
                )
            goal_text = rewrite_result.get("rewritten", goal_text)
            eval_result = await evaluate_goal(
                goal_text=goal_text,
                position=position,
                department=department_name,
                employee_id=employee_id,
                quarter=quarter,
                year=year,
                db=db,
                prefer_rule_based=True,
            )

        # Activity-цели автоматически пробуем перевести в output/impact.
        activity_rewritten = False
        if eval_result.goal_type == "activity":
            try:
                rewrite_result = await call_llm(
                    REWRITE_GOAL_PROMPT.format(
                        goal_text=goal_text,
                        position=position,
                        department=department_name,
                        weak_criteria="goal_type, M, T",
                    )
                )
            except Exception as exc:
                logger.warning("LLM activity rewrite unavailable, switching to offline rewrite: %s", exc)
                rewrite_result = _offline_rewrite_goal(
                    goal_text=goal_text,
                    weak_criteria=["M", "T"],
                    quarter=quarter,
                    year=year,
                )
            rewritten_activity_goal = rewrite_result.get("rewritten", goal_text)
            if rewritten_activity_goal and rewritten_activity_goal != goal_text:
                rewritten_eval = await evaluate_goal(
                    goal_text=rewritten_activity_goal,
                    position=position,
                    department=department_name,
                    employee_id=employee_id,
                    quarter=quarter,
                    year=year,
                    db=db,
                    prefer_rule_based=True,
                )
                if rewritten_eval.smart_index >= eval_result.smart_index:
                    goal_text = rewritten_activity_goal
                    eval_result = rewritten_eval
                    activity_rewritten = True

        # Парсим дедлайн
        deadline = None
        if raw.get("deadline"):
            try:
                deadline = date.fromisoformat(raw["deadline"])
            except (ValueError, TypeError):
                pass

        # Находим source_doc_id из чанков с приоритетом source_ref (DOC1/DOC2/...)
        selected_chunk, selected_chunk_ref = _select_chunk_by_source_ref(chunks, raw.get("source_ref"))
        source_doc_title = raw.get("source_doc_title")
        if selected_chunk is None and source_doc_title:
            for idx, chunk in enumerate(chunks):
                if chunk.get("metadata", {}).get("doc_title") == source_doc_title:
                    selected_chunk = chunk
                    selected_chunk_ref = _source_ref_for_index(idx)
                    break
        if selected_chunk is None and chunks:
            selected_chunk = chunks[0]
            selected_chunk_ref = _source_ref_for_index(0)

        source_reference: str | None = None
        source_doc_id = None
        source_doc_type = None
        source_quote = raw.get("source_quote")
        if selected_chunk:
            meta = selected_chunk.get("metadata", {})
            source_doc_title = source_doc_title or meta.get("doc_title")
            source_doc_type = meta.get("doc_type")
            section_id = meta.get("section_id") if isinstance(meta.get("section_id"), str) else None
            paragraph_start = _safe_int(meta.get("paragraph_start"))
            paragraph_end = _safe_int(meta.get("paragraph_end"))
            chunk_index = _safe_int(meta.get("chunk_index"))
            try:
                source_doc_id = uuid.UUID(str(meta.get("doc_id", "")))
            except (ValueError, TypeError):
                source_doc_id = None

            selected_chunk_text = (selected_chunk.get("text") or "").strip()
            if not source_quote:
                source_quote = selected_chunk_text[:260]

            doc_content = None
            if source_doc_id:
                doc_content = document_content_cache.get(source_doc_id)
                if doc_content is None:
                    doc_obj = await db.get(Document, source_doc_id)
                    doc_content = (doc_obj.content or "") if doc_obj else ""
                    document_content_cache[source_doc_id] = doc_content

            if not section_id:
                inferred_section_id, _ = infer_section_from_text(selected_chunk_text)
                section_id = inferred_section_id
            if (paragraph_start is None or paragraph_end is None) and doc_content:
                inferred_start, inferred_end = infer_paragraph_span(doc_content, selected_chunk_text)
                paragraph_start = paragraph_start if paragraph_start is not None else inferred_start
                paragraph_end = paragraph_end if paragraph_end is not None else inferred_end

            source_reference = format_source_reference(
                source_ref=selected_chunk_ref,
                section_id=section_id,
                paragraph_start=paragraph_start,
                paragraph_end=paragraph_end,
                chunk_index=chunk_index,
            )
        elif fallback_docs:
            fallback_doc = fallback_docs[len(suggestions) % len(fallback_docs)]
            source_doc_id = fallback_doc.doc_id
            source_doc_title = source_doc_title or fallback_doc.title
            source_doc_type = fallback_doc.doc_type
            if not source_quote:
                source_quote = (fallback_doc.content or "").strip()[:260]

            inferred_section_id, _ = infer_section_from_text(source_quote)
            p_start, p_end = infer_paragraph_span(fallback_doc.content or "", source_quote)
            source_reference = format_source_reference(
                source_ref=None,
                section_id=inferred_section_id,
                paragraph_start=p_start,
                paragraph_end=p_end,
                chunk_index=None,
            )
        source_quote = attach_reference_to_quote(str(source_quote or ""), source_reference)

        if source_doc_id is None:
            raise ValueError(
                "No active source documents found for generation. "
                "Load documents into the `documents` table and run ingestion."
            )

        alignment_level = _infer_alignment_from_doc_type(source_doc_type) or eval_result.alignment_level
        alignment_source = source_doc_title or eval_result.alignment_source
        source_doc_link = f"/api/v1/documents/{source_doc_id}" if source_doc_id else None
        generation_context = raw.get("generation_context") or (
            f"Цель предложена для роли '{position}' и подразделения '{department_prompt}'"
        )
        if source_reference and source_reference not in generation_context:
            generation_context = f"{generation_context}. Основание: {source_reference}"

        duplicate_matches = await find_goal_duplicates(
            goal_text=goal_text,
            employee_id=employee_id,
            quarter=quarter,
            year=year,
            db=db,
        )
        intra_duplicates = _intra_duplicate_matches(goal_text, accepted_texts)
        duplicate_texts = [match.goal_text for match in duplicate_matches]
        duplicate_texts.extend(intra_duplicates)
        duplicate_texts = list(dict.fromkeys(duplicate_texts))[:3]
        duplicate_score = max((match.similarity for match in duplicate_matches), default=None)
        suggestion_warnings: list[str] = []

        if duplicate_texts:
            duplicate_warning = (
                "Возможное дублирование цели: формулировка похожа на уже существующие цели "
                "сотрудника/подразделения."
            )
            suggestion_warnings.append(duplicate_warning)
            generation_warnings.append(duplicate_warning)
            duplicate_alert_messages.append(duplicate_warning)
        if eval_result.goal_type == "activity" and not activity_rewritten:
            suggestion_warnings.append(
                "Цель остаётся activity-based. Рекомендуется вручную перевести формулировку в output/impact."
            )

        suggested = SuggestedGoal(
            session_id=session.id,
            employee_id=employee_id,
            goal_text=goal_text,
            metric=raw.get("metric"),
            deadline=deadline,
            weight_suggestion=raw.get("weight_suggestion"),
            smart_index=eval_result.smart_index,
            goal_type=eval_result.goal_type or raw.get("goal_type", "output"),
            source_doc_id=source_doc_id,
            source_doc_title=source_doc_title,
            source_quote=source_quote,
            generation_context=generation_context,
        )
        db.add(suggested)
        await db.flush()

        suggestions.append(SuggestedGoalItem(
            id=suggested.id,
            goal_text=goal_text,
            metric=raw.get("metric"),
            deadline=deadline,
            weight_suggestion=raw.get("weight_suggestion"),
            smart_index=eval_result.smart_index,
            scores=eval_result.scores,
            goal_type=eval_result.goal_type or raw.get("goal_type", "output"),
            alignment_level=alignment_level,
            alignment_source=alignment_source,
            source_doc_id=source_doc_id,
            source_doc_title=source_doc_title,
            source_doc_link=source_doc_link,
            source_quote=source_quote,
            source_reference=source_reference,
            generation_context=generation_context,
            duplicate_score=duplicate_score,
            duplicate_with=duplicate_texts,
            warnings=suggestion_warnings,
        ))
        accepted_texts.append(goal_text)

    if len(suggestions) < settings.min_goals:
        raise ValueError(
            f"Only {len(suggestions)} goals passed validation, expected at least {settings.min_goals}"
        )

    docs_used = sorted({
        s.source_doc_title
        for s in suggestions
        if s.source_doc_title
    })

    await db.commit()
    if duplicate_alert_messages:
        unique_messages = list(dict.fromkeys(duplicate_alert_messages))
        for message in unique_messages:
            await create_alert_if_absent(
                db=db,
                employee_id=employee_id,
                alert_type="duplicate_goal",
                severity="warning",
                message=message,
                notify_manager=True,
            )

    response = GenerateGoalsResponse(
        session_id=session.id,
        employee_id=employee_id,
        quarter=quarter,
        suggestions=suggestions,
        manager_goals_used=manager_goals_list,
        documents_used=docs_used,
        warnings=list(dict.fromkeys(generation_warnings)),
    )
    trace_ai_event(
        "generate.response",
        {
            "session_id": str(response.session_id),
            "employee_id": str(response.employee_id),
            "quarter": response.quarter,
            "suggestions_count": len(response.suggestions),
            "documents_used": response.documents_used,
            "warnings": response.warnings,
            "suggestions": [
                {
                    "id": str(s.id),
                    "goal_text": s.goal_text,
                    "smart_index": s.smart_index,
                    "source_doc_id": str(s.source_doc_id) if s.source_doc_id else None,
                    "source_doc_title": s.source_doc_title,
                }
                for s in response.suggestions
            ],
        },
    )
    return response


async def accept_suggested_goal(
    suggested_goal_id: uuid.UUID,
    employee_id: int,
    weight: float | None,
    db: AsyncSession,
) -> tuple[uuid.UUID, list[str]]:
    """
    Принимает сгенерированную цель — создаёт запись в goals.
    """
    result = await db.execute(
        select(SuggestedGoal)
        .options(selectinload(SuggestedGoal.session))
        .where(SuggestedGoal.id == suggested_goal_id)
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        raise ValueError("Suggested goal not found")
    if suggestion.employee_id != employee_id:
        raise PermissionError("Suggested goal does not belong to employee")
    if suggestion.status == "accepted" and suggestion.accepted_goal_id:
        existing_validation = await validate_goal_set_constraints(
            employee_id=employee_id,
            quarter=suggestion.session.quarter if suggestion.session else None,
            year=suggestion.session.year if suggestion.session else None,
            db=db,
        )
        return suggestion.accepted_goal_id, existing_validation["warnings"]

    employee_result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.department))
        .where(Employee.id == suggestion.employee_id)
    )
    employee = employee_result.scalar_one_or_none()
    if not employee:
        raise ValueError("Employee not found")

    position_name = employee.position.name if employee.position else None
    department_name = employee.department.name if employee.department else "Подразделение"

    # Создаём реальную цель
    goal = Goal(
        employee_id=suggestion.employee_id,
        department_id=employee.department_id,
        employee_name_snapshot=employee.full_name,
        position=position_name,
        department_name_snapshot=employee.department.name if employee.department else None,
        goal_text=suggestion.goal_text,
        metric=suggestion.metric,
        deadline=suggestion.deadline,
        weight=weight or suggestion.weight_suggestion or 1.0,
        status="draft",
        quarter=suggestion.session.quarter if suggestion.session else None,
        year=suggestion.session.year if suggestion.session else None,
    )
    db.add(goal)
    await db.flush()

    event = GoalEvent(
        goal_id=goal.id,
        event_type="created",
        actor_id=employee_id,
        old_status=None,
        new_status="draft",
        old_text=None,
        new_text=goal.goal_text,
        metadata_={
            "suggested_goal_id": str(suggestion.id),
            "generation_session_id": str(suggestion.session_id),
            "source_doc_id": str(suggestion.source_doc_id) if suggestion.source_doc_id else None,
            "source_doc_title": suggestion.source_doc_title,
            "source_quote": suggestion.source_quote,
            "generation_context": suggestion.generation_context,
        },
    )
    db.add(event)

    goal_source = GoalSource(
        goal_id=goal.id,
        suggested_goal_id=suggestion.id,
        generation_session_id=suggestion.session_id,
        source_doc_id=suggestion.source_doc_id,
        source_doc_title=suggestion.source_doc_title,
        source_quote=suggestion.source_quote,
        generation_context=suggestion.generation_context,
    )
    db.add(goal_source)

    # Обновляем статус предложения
    suggestion.status = "accepted"
    suggestion.accepted_goal_id = goal.id

    try:
        await evaluate_goal(
            goal_text=goal.goal_text,
            position=position_name or "Сотрудник",
            department=department_name,
            goal_id=goal.id,
            employee_id=employee_id,
            quarter=goal.quarter,
            year=goal.year,
            db=db,
            prefer_rule_based=True,
        )
    except Exception as exc:
        logger.warning("Evaluation after goal accept failed for goal %s: %s", goal.id, exc)
        await db.commit()

    warnings: list[str] = []
    duplicates = await find_goal_duplicates(
        goal_text=goal.goal_text,
        employee_id=employee_id,
        quarter=goal.quarter,
        year=goal.year,
        db=db,
        exclude_goal_id=goal.id,
    )
    if duplicates:
        duplicate_warning = "Принятая цель похожа на существующие цели сотрудника/подразделения."
        warnings.append(duplicate_warning)
        await create_alert_if_absent(
            db=db,
            employee_id=employee_id,
            goal_id=goal.id,
            alert_type="duplicate_goal",
            severity="warning",
            message=duplicate_warning,
            notify_manager=True,
        )

    constraints = await validate_goal_set_constraints(
        employee_id=employee_id,
        quarter=goal.quarter,
        year=goal.year,
        db=db,
    )
    warnings.extend(constraints["warnings"])
    warnings = list(dict.fromkeys(warnings))

    return goal.id, warnings


async def reject_suggested_goal(
    *,
    suggested_goal_id: uuid.UUID,
    employee_id: int,
    reason: str | None,
    db: AsyncSession,
) -> uuid.UUID:
    result = await db.execute(
        select(SuggestedGoal).where(SuggestedGoal.id == suggested_goal_id)
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        raise ValueError("Suggested goal not found")
    if suggestion.employee_id != employee_id:
        raise PermissionError("Suggested goal does not belong to employee")
    if suggestion.status == "accepted":
        raise ValueError("Accepted suggested goal cannot be rejected")
    if suggestion.status == "rejected":
        return suggestion.id

    suggestion.status = "rejected"
    if reason:
        reason_text = reason.strip()
        if reason_text:
            existing_context = suggestion.generation_context or ""
            marker = f"[rejected_reason] {reason_text}"
            suggestion.generation_context = f"{existing_context}\n{marker}".strip()[:4000]
    await db.commit()
    return suggestion.id


async def rewrite_goal(
    goal_text: str,
    position: str,
    department: str,
    weak_criteria: list[str] | None,
    db: AsyncSession,
) -> RewriteGoalResponse:
    from app.ai.prompts import REWRITE_GOAL_PROMPT

    # Оцениваем оригинал
    eval_before = await evaluate_goal(goal_text=goal_text, position=position, department=department)

    prompt = REWRITE_GOAL_PROMPT.format(
        goal_text=goal_text,
        position=position,
        department=department,
        weak_criteria=", ".join(weak_criteria or eval_before.weak_criteria),
    )

    quarter = "Q4"
    year = date.today().year
    try:
        result = await call_llm(prompt)
    except Exception as exc:
        logger.warning("LLM rewrite endpoint unavailable, switching to offline rewrite: %s", exc)
        result = _offline_rewrite_goal(
            goal_text=goal_text,
            weak_criteria=weak_criteria or eval_before.weak_criteria,
            quarter=quarter,
            year=year,
        )
    rewritten = result.get("rewritten", goal_text)

    # Оцениваем результат
    eval_after = await evaluate_goal(goal_text=rewritten, position=position, department=department)

    return RewriteGoalResponse(
        original=goal_text,
        rewritten=rewritten,
        smart_index_before=eval_before.smart_index,
        smart_index_after=eval_after.smart_index,
        improvements=result.get("improvements", []),
    )
