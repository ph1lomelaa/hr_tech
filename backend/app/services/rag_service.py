import logging
import asyncio
import re
import uuid
from typing import Iterable

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_models import DocumentChunk
from app.models.hr_models import Document
from app.utils.citation import format_source_reference, infer_paragraph_span, infer_section_from_text
from app.utils.document_scope import department_scope_matches, scope_metadata
from app.utils.ai_trace import trace_ai_event
from app.vector_store.chroma_client import search_documents

logger = logging.getLogger(__name__)

RRF_K = 60
_TOKEN_RE = re.compile(r"[a-zA-Zа-яА-Я0-9]+")


def _normalize_text(value: str) -> str:
    return " ".join(str(value).replace("_", " ").replace("-", " ").lower().split()).strip()


def build_department_aliases(
    department: str | None,
    department_code: str | None = None,
) -> list[str]:
    candidates: list[str] = []
    if department:
        candidates.append(" ".join(department.split()))
    if department_code:
        code = department_code.strip()
        if code:
            candidates.extend([code, code.upper()])

    seen: set[str] = set()
    aliases: list[str] = []
    for item in candidates:
        norm = _normalize_text(item)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        aliases.append(item.strip())
    return aliases


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
 

def build_queries(
    position: str,
    department: str,
    focus_direction: str | None,
    department_aliases: list[str] | None = None,
) -> list[str]:
    base = f"{position} {department}".strip()
    queries = [base, department]
    if department_aliases:
        for alias in department_aliases:
            queries.extend([f"{position} {alias}", alias])
    if focus_direction:
        queries.extend(
            [
                f"{position} {department} {focus_direction}",
                f"{department} {focus_direction}",
                f"{position} {focus_direction}",
                focus_direction,
            ]
        )
        if department_aliases:
            for alias in department_aliases:
                queries.append(f"{alias} {focus_direction}")
    return _unique_queries(queries)


def _chunk_key(item: dict) -> str:
    meta = item.get("metadata", {})
    doc_id = meta.get("doc_id", "")
    chunk_index = meta.get("chunk_index", "")
    text = item.get("text", "")
    return f"{doc_id}:{chunk_index}:{hash(text)}"


def _query_tokens(query: str) -> list[str]:
    return [token for token in _TOKEN_RE.findall(query.lower()) if len(token) >= 3]


def _safe_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _enrich_metadata_with_citation(
    *,
    chunk_text: str,
    metadata: dict,
    document_content: str | None,
) -> dict:
    meta = dict(metadata)
    section_id = meta.get("section_id")
    section_title = meta.get("section_title")
    paragraph_start = _safe_int(meta.get("paragraph_start"))
    paragraph_end = _safe_int(meta.get("paragraph_end"))

    if not section_id or not section_title:
        inferred_section_id, inferred_section_title = infer_section_from_text(chunk_text)
        section_id = section_id or inferred_section_id
        section_title = section_title or inferred_section_title

    if (paragraph_start is None or paragraph_end is None) and document_content:
        p_start, p_end = infer_paragraph_span(document_content, chunk_text)
        paragraph_start = paragraph_start if paragraph_start is not None else p_start
        paragraph_end = paragraph_end if paragraph_end is not None else p_end

    chunk_index = _safe_int(meta.get("chunk_index"))
    source_reference = format_source_reference(
        source_ref=None,
        section_id=section_id if isinstance(section_id, str) else None,
        paragraph_start=paragraph_start,
        paragraph_end=paragraph_end,
        chunk_index=chunk_index,
    )

    meta["section_id"] = section_id
    meta["section_title"] = section_title
    meta["paragraph_start"] = paragraph_start
    meta["paragraph_end"] = paragraph_end
    meta["source_reference"] = source_reference
    return meta


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


def _dept_filter(
    item: dict,
    department_aliases: list[str] | None,
    department_ids: list[int] | None,
) -> bool:
    if not department_aliases and not department_ids:
        return True
    meta = item.get("metadata", {})
    scope_raw = meta.get("department_scope")
    return department_scope_matches(
        scope_raw,
        aliases=department_aliases,
        department_ids=department_ids,
    )


async def _keyword_search_chunks(
    db: AsyncSession,
    query: str,
    n_results: int,
) -> list[dict]:
    """
    Лексический поиск по чанкам в PostgreSQL (FTS).
    """
    rows: list[tuple] = []
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
        rows = result.all()
    except Exception as e:
        logger.warning(f"FTS search failed, fallback to token ILIKE: {e}")

    if not rows:
        tokens = _query_tokens(query)
        ilike_conditions = [DocumentChunk.chunk_text.ilike(f"%{token}%") for token in tokens[:8]]
        if not ilike_conditions:
            ilike_conditions = [DocumentChunk.chunk_text.ilike(f"%{query}%")]
        stmt = (
            select(DocumentChunk, Document)
            .join(Document, Document.doc_id == DocumentChunk.doc_id)
            .where(Document.is_active == True)  # noqa: E712
            .where(or_(*ilike_conditions))
            .limit(n_results)
        )
        ilike_result = await db.execute(stmt)
        ilike_rows = ilike_result.all()
        payload: list[dict] = []
        for chunk, doc in ilike_rows:
            base_meta = {
                "doc_id": str(doc.doc_id),
                "doc_title": doc.title,
                "doc_type": doc.doc_type,
                **scope_metadata(doc.department_scope),
                "keywords": ",".join(doc.keywords or []),
                "chunk_index": chunk.chunk_index,
            }
            payload.append(
                {
                    "text": chunk.chunk_text,
                    "metadata": _enrich_metadata_with_citation(
                        chunk_text=chunk.chunk_text,
                        metadata=base_meta,
                        document_content=doc.content,
                    ),
                    "distance": 0.5,
                }
            )
        return payload

    payload: list[dict] = []
    for chunk, doc, rank_value in rows:
        base_meta = {
            "doc_id": str(doc.doc_id),
            "doc_title": doc.title,
            "doc_type": doc.doc_type,
            **scope_metadata(doc.department_scope),
            "keywords": ",".join(doc.keywords or []),
            "chunk_index": chunk.chunk_index,
        }
        payload.append(
            {
                "text": chunk.chunk_text,
                "metadata": _enrich_metadata_with_citation(
                    chunk_text=chunk.chunk_text,
                    metadata=base_meta,
                    document_content=doc.content,
                ),
                "distance": 1 - float(rank_value or 0.0),
            }
        )
    return payload


async def search_vnd_hybrid(
    queries: list[str],
    n_results: int,
    db: AsyncSession | None,
    department_aliases: list[str] | None = None,
    department_ids: list[int] | None = None,
) -> list[dict]:
    """
    Hybrid RAG: multi-query + vector + lexical + RRF fusion.
    """
    tasks: list[asyncio.Task[list[dict]]] = []
    for q in queries:
        tasks.append(asyncio.create_task(search_documents(query=q, n_results=n_results)))

    raw_results = await asyncio.gather(*tasks, return_exceptions=True) if tasks else []
    lists: list[list[dict]] = []
    for item in raw_results:
        if isinstance(item, Exception):
            logger.warning("Hybrid RAG branch failed: %s", item)
            continue
        lists.append(item)

    if db is not None:
        for q in queries:
            try:
                lists.append(await _keyword_search_chunks(db, q, n_results))
            except Exception as exc:
                logger.warning("Hybrid RAG lexical branch failed for query '%s': %s", q, exc)

    fused = _rrf_fuse(lists)
    filtered = [c for c in fused if _dept_filter(c, department_aliases, department_ids)]
    if (department_aliases or department_ids) and not filtered and fused:
        logger.info(
            "Department filter produced no chunks for aliases=%s ids=%s; using unfiltered fused results",
            department_aliases,
            department_ids,
        )
        return fused[:n_results]
    return filtered[:n_results]


async def get_relevant_vnd(
    position: str,
    department: str,
    focus_direction: str | None = None,
    n_results: int = 5,
    db: AsyncSession | None = None,
    department_code: str | None = None,
    department_id: int | None = None,
) -> list[dict]:
    """
    RAG-поиск по ВНД для генерации целей.
    Возвращает релевантные чанки с метаданными.
    """
    department_aliases = build_department_aliases(department=department, department_code=department_code)
    queries = build_queries(
        position=position,
        department=department,
        focus_direction=focus_direction,
        department_aliases=department_aliases,
    )
    trace_ai_event(
        "rag.query",
        {
            "position": position,
            "department": department,
            "department_id": department_id,
            "department_code": department_code,
            "department_aliases": department_aliases,
            "focus_direction": focus_direction,
            "queries": queries,
            "n_results": n_results,
        },
    )
    chunks = await search_vnd_hybrid(
        queries=queries,
        n_results=n_results,
        db=db,
        department_aliases=department_aliases,
        department_ids=[department_id] if department_id is not None else None,
    )

    if not chunks:
        logger.warning("RAG returned no results")
        trace_ai_event(
            "rag.results",
            {"count": 0, "chunks": []},
        )
        return []

    if db is not None:
        content_cache: dict[str, str] = {}
        enriched_chunks: list[dict] = []
        for chunk in chunks:
            meta = dict(chunk.get("metadata") or {})
            doc_id = str(meta.get("doc_id") or "").strip()
            doc_content = content_cache.get(doc_id)
            if doc_content is None and doc_id:
                try:
                    doc_uuid = uuid.UUID(doc_id)
                except ValueError:
                    doc_uuid = None
                if doc_uuid is not None:
                    doc_obj = await db.get(Document, doc_uuid)
                    doc_content = (doc_obj.content or "") if doc_obj else ""
                else:
                    doc_content = ""
                content_cache[doc_id] = doc_content
            enriched_meta = _enrich_metadata_with_citation(
                chunk_text=chunk.get("text", ""),
                metadata=meta,
                document_content=doc_content,
            )
            enriched_chunks.append(
                {
                    "text": chunk.get("text", ""),
                    "metadata": enriched_meta,
                    "distance": chunk.get("distance"),
                    "rrf_score": chunk.get("rrf_score"),
                }
            )
        chunks = enriched_chunks

    trace_ai_event(
        "rag.results",
        {
            "count": len(chunks),
            "chunks": [
                {
                    "doc_id": c.get("metadata", {}).get("doc_id"),
                    "doc_title": c.get("metadata", {}).get("doc_title"),
                    "doc_type": c.get("metadata", {}).get("doc_type"),
                    "distance": c.get("distance"),
                    "text": c.get("text", ""),
                }
                for c in chunks
            ],
        },
    )
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
        ref = f"DOC{i}"
        title = meta.get("doc_title", "Документ")
        doc_type = meta.get("doc_type", "ВНД")
        section_id = meta.get("section_id")
        paragraph_start = _safe_int(meta.get("paragraph_start"))
        paragraph_end = _safe_int(meta.get("paragraph_end"))
        chunk_index = _safe_int(meta.get("chunk_index"))
        source_reference = format_source_reference(
            source_ref=ref,
            section_id=section_id if isinstance(section_id, str) else None,
            paragraph_start=paragraph_start,
            paragraph_end=paragraph_end,
            chunk_index=chunk_index,
        )

        lines.append(f"[{ref}] {doc_type}: {title}")
        if source_reference:
            lines.append(f"Ссылка: {source_reference}")
        lines.append(chunk["text"][:400])
        lines.append("")

    return "\n".join(lines)
