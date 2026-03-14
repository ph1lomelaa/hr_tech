import logging
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_models import DocumentChunk
from app.models.hr_models import Document
from app.vector_store.chroma_client import search_documents

logger = logging.getLogger(__name__)

RRF_K = 60


def _unique_queries(queries: Iterable[str]) -> list[str]:
    seen = set()
    result = []
    for q in queries:
        qn = " ".join(q.split()).strip()
        if not qn or qn in seen:
            continue
        seen.add(qn)
        result.append(qn)
    return result


def build_queries(position: str, department: str, focus_direction: str | None) -> list[str]:
    base = f"{position} {department}".strip()
    queries = [base]
    if focus_direction:
        queries.extend(
            [
                f"{position} {department} {focus_direction}",
                f"{department} {focus_direction}",
                f"{position} {focus_direction}",
                focus_direction,
            ]
        )
    return _unique_queries(queries)


def _chunk_key(item: dict) -> str:
    meta = item.get("metadata", {})
    doc_id = meta.get("doc_id", "")
    chunk_index = meta.get("chunk_index", "")
    text = item.get("text", "")
    return f"{doc_id}:{chunk_index}:{hash(text)}"


def _rrf_fuse(lists: list[list[dict]], k: int = RRF_K) -> list[dict]:
    scores: dict[str, float] = {}
    items: dict[str, dict] = {}
    for lst in lists:
        for rank, item in enumerate(lst):
            key = _chunk_key(item)
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
            if key not in items:
                items[key] = item
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    fused = []
    for key, score in ranked:
        item = items[key]
        item["rrf_score"] = round(score, 6)
        fused.append(item)
    return fused


def _dept_filter(item: dict, department: str | None) -> bool:
    if not department:
        return True
    meta = item.get("metadata", {})
    scope = meta.get("department_scope") or ""
    if not scope:
        return True
    return department.lower() in str(scope).lower()


async def _keyword_search_chunks(
    db: AsyncSession,
    query: str,
    n_results: int,
) -> list[dict]:
    """
    Лексический поиск по чанкам в PostgreSQL (FTS).
    """
    try:
        ts_query = func.plainto_tsquery("russian", query)
        rank = func.ts_rank_cd(func.to_tsvector("russian", DocumentChunk.chunk_text), ts_query)

        stmt = (
            select(DocumentChunk, Document, rank.label("rank"))
            .join(Document, Document.doc_id == DocumentChunk.doc_id)
            .where(Document.is_active == True)  # noqa: E712
            .where(func.to_tsvector("russian", DocumentChunk.chunk_text).op("@@")(ts_query))
            .order_by(func.ts_rank_cd(func.to_tsvector("russian", DocumentChunk.chunk_text), ts_query).desc())
            .limit(n_results)
        )
        result = await db.execute(stmt)
    except Exception as e:
        logger.warning(f"FTS search failed, fallback to ILIKE: {e}")
        like_q = f"%{query}%"
        stmt = (
            select(DocumentChunk, Document)
            .join(Document, Document.doc_id == DocumentChunk.doc_id)
            .where(Document.is_active == True)  # noqa: E712
            .where(DocumentChunk.chunk_text.ilike(like_q))
            .limit(n_results)
        )
        result = await db.execute(stmt)
        rows = result.all()
        return [
            {
                "text": chunk.chunk_text,
                "metadata": {
                    "doc_id": str(doc.doc_id),
                    "doc_title": doc.title,
                    "doc_type": doc.doc_type,
                    "department_scope": ",".join(doc.department_scope or []),
                    "keywords": ",".join(doc.keywords or []),
                    "chunk_index": chunk.chunk_index,
                },
                "distance": 0.5,
            }
            for chunk, doc in rows
        ]

    rows = result.all()
    return [
        {
            "text": chunk.chunk_text,
            "metadata": {
                "doc_id": str(doc.doc_id),
                "doc_title": doc.title,
                "doc_type": doc.doc_type,
                "department_scope": ",".join(doc.department_scope or []),
                "keywords": ",".join(doc.keywords or []),
                "chunk_index": chunk.chunk_index,
            },
            "distance": 1 - float(rank_value or 0.0),
        }
        for chunk, doc, rank_value in rows
    ]


async def search_vnd_hybrid(
    queries: list[str],
    n_results: int,
    db: AsyncSession | None,
    department: str | None = None,
) -> list[dict]:
    """
    Hybrid RAG: multi-query + vector + lexical + RRF fusion.
    """
    lists: list[list[dict]] = []
    for q in queries:
        lists.append(await search_documents(query=q, n_results=n_results))
        if db is not None:
            lists.append(await _keyword_search_chunks(db, q, n_results))

    fused = _rrf_fuse(lists)
    filtered = [c for c in fused if _dept_filter(c, department)]
    return filtered[:n_results]


async def get_relevant_vnd(
    position: str,
    department: str,
    focus_direction: str | None = None,
    n_results: int = 5,
    db: AsyncSession | None = None,
) -> list[dict]:
    """
    RAG-поиск по ВНД для генерации целей.
    Возвращает релевантные чанки с метаданными.
    """
    queries = build_queries(position, department, focus_direction)
    chunks = await search_vnd_hybrid(queries=queries, n_results=n_results, db=db, department=department)

    if not chunks:
        # Возвращаем заглушку если ChromaDB не доступен
        logger.warning("RAG returned no results, using stub VND context")
        return _stub_vnd_context(department)

    return chunks


def format_vnd_context(chunks: list[dict]) -> str:
    """
    Форматирует чанки ВНД в текст для промпта.
    """
    if not chunks:
        return "Документы ВНД не найдены."

    lines = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk.get("metadata", {})
        title = meta.get("doc_title", "Документ")
        doc_type = meta.get("doc_type", "ВНД")
        lines.append(f"[{i}] {doc_type}: {title}")
        lines.append(chunk["text"][:400])
        lines.append("")

    return "\n".join(lines)


def _stub_vnd_context(department: str) -> list[dict]:
    return [
        {
            "text": (
                f"Сотрудники {department} обязаны устанавливать измеримые цели с конкретными KPI и "
                "сроками выполнения. Каждая цель должна быть связана со стратегическими приоритетами "
                "компании."
            ),
            "metadata": {
                "doc_title": "ВНД-001 Положение о целеполагании",
                "doc_type": "ВНД",
                "doc_id": "00000000-0000-0000-0000-000000000001",
            },
            "distance": 0.2,
        },
        {
            "text": (
                "Стратегическими приоритетами компании на 2026 год являются: цифровизация процессов, "
                "повышение клиентского NPS до 75 баллов, снижение операционных издержек на 15%."
            ),
            "metadata": {
                "doc_title": "Стратегия компании 2026",
                "doc_type": "Стратегия",
                "doc_id": "00000000-0000-0000-0000-000000000002",
            },
            "distance": 0.25,
        },
    ]
