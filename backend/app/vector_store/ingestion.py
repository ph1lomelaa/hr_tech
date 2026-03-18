
import logging
import re
import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import embed_texts_async, embeddings_available
from app.models.hr_models import Document
from app.models.ai_models import DocumentChunk
from app.utils.citation import infer_section_from_text, split_paragraphs
from app.utils.document_scope import extract_department_scope_ids, scope_metadata
from app.vector_store.chroma_client import add_documents, delete_documents_by_doc_id

logger = logging.getLogger(__name__)

CHUNK_MAX_CHARS = 900
SENTENCE_OVERLAP = 2

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_sentences(paragraph: str) -> list[str]:
    parts = _SENTENCE_SPLIT_RE.split(paragraph.strip())
    return [p.strip() for p in parts if p.strip()]


def chunk_sentences(
    sentences: list[str],
    max_chars: int = CHUNK_MAX_CHARS,
    overlap: int = SENTENCE_OVERLAP,
) -> list[str]:
    if not sentences:
        return []
    chunks: list[str] = []
    buffer: list[str] = []
    buffer_len = 0

    for sent in sentences:
        sent_len = len(sent) + (1 if buffer else 0)
        if buffer and buffer_len + sent_len > max_chars:
            chunks.append(" ".join(buffer).strip())
            if overlap > 0:
                buffer = buffer[-overlap:]
                buffer_len = sum(len(s) for s in buffer) + max(0, len(buffer) - 1)
            else:
                buffer = []
                buffer_len = 0
        buffer.append(sent)
        buffer_len += sent_len

    if buffer:
        chunks.append(" ".join(buffer).strip())

    return chunks


def _normalize_section_id(section_id: str | None, fallback_index: int) -> str:
    if section_id and section_id.strip():
        return section_id.strip()
    return f"§S{fallback_index:02d}"


def chunk_text_with_metadata(text: str) -> list[dict]:
    text = normalize_text(text)
    if not text:
        return []

    paragraphs = split_paragraphs(text)
    chunks: list[dict] = []

    buffer_parts: list[str] = []
    buffer_len = 0
    buffer_para_start: int | None = None
    buffer_para_end: int | None = None
    buffer_section_id: str | None = None
    buffer_section_title: str | None = None

    section_counter = 0
    current_section_id = "§S00"
    current_section_title = "Общий раздел"

    def flush_buffer() -> None:
        nonlocal buffer_parts, buffer_len, buffer_para_start, buffer_para_end, buffer_section_id, buffer_section_title
        if not buffer_parts:
            return
        section_id = _normalize_section_id(buffer_section_id, fallback_index=max(0, section_counter))
        chunks.append(
            {
                "text": "\n\n".join(buffer_parts).strip(),
                "section_id": section_id,
                "section_title": buffer_section_title or current_section_title,
                "paragraph_start": buffer_para_start,
                "paragraph_end": buffer_para_end,
            }
        )
        buffer_parts = []
        buffer_len = 0
        buffer_para_start = None
        buffer_para_end = None
        buffer_section_id = None
        buffer_section_title = None

    for para_index, para in enumerate(paragraphs, start=1):
        inferred_section_id, inferred_section_title = infer_section_from_text(para)
        if inferred_section_id:
            section_counter += 1
            current_section_id = _normalize_section_id(inferred_section_id, fallback_index=section_counter)
            current_section_title = inferred_section_title or current_section_title

        para_section_id = current_section_id
        para_section_title = current_section_title

        if len(para) <= CHUNK_MAX_CHARS:
            additional_len = len(para) + (2 if buffer_parts else 0)
            can_append = (
                buffer_parts
                and buffer_len + additional_len <= CHUNK_MAX_CHARS
                and buffer_section_id == para_section_id
            )
            if can_append:
                buffer_parts.append(para)
                buffer_len += additional_len
                buffer_para_end = para_index
            else:
                flush_buffer()
                buffer_parts = [para]
                buffer_len = len(para)
                buffer_para_start = para_index
                buffer_para_end = para_index
                buffer_section_id = para_section_id
                buffer_section_title = para_section_title
            continue

        flush_buffer()
        sentences = split_sentences(para)
        sentence_chunks = chunk_sentences(sentences)
        for sentence_chunk in sentence_chunks:
            chunks.append(
                {
                    "text": sentence_chunk.strip(),
                    "section_id": para_section_id,
                    "section_title": para_section_title,
                    "paragraph_start": para_index,
                    "paragraph_end": para_index,
                }
            )

    flush_buffer()
    return [chunk for chunk in chunks if chunk.get("text")]


def chunk_text(text: str) -> list[str]:
    return [chunk["text"] for chunk in chunk_text_with_metadata(text)]


def build_embedding_text(doc: Document, chunk_text_value: str) -> str:
    parts: list[str] = []
    if doc.doc_type or doc.title:
        label = " ".join([p for p in [doc.doc_type, doc.title] if p]).strip()
        if label:
            parts.append(label)
    if doc.department_scope:
        scope_ids = extract_department_scope_ids(doc.department_scope)
        if scope_ids:
            parts.append(f"Подразделения ID: {', '.join(str(item) for item in scope_ids)}")
    if doc.keywords:
        parts.append(f"Ключевые темы: {', '.join(doc.keywords)}")
    prefix = " | ".join(parts)
    return f"{prefix}\n{chunk_text_value}" if prefix else chunk_text_value


async def ingest_all_documents(db: AsyncSession) -> int:
    """
    Достаёт все активные документы из БД, чанкует и загружает в ChromaDB.
    Возвращает количество загруженных чанков.
    """
    result = await db.execute(
        select(Document).where(Document.is_active == True)  # noqa: E712
    )
    documents = result.scalars().all()

    total_chunks = 0
    vector_embeddings_available = embeddings_available(include_remote=True)

    if not vector_embeddings_available:
        logger.warning(
            "Vector embeddings are unavailable; ingestion will populate document_chunks only"
        )

    for doc in documents:
        content = doc.content or ""
        chunk_items = chunk_text_with_metadata(content)
        if not chunk_items:
            logger.warning(f"Document '{doc.title}' has no content to ingest")
            continue

        await db.execute(delete(DocumentChunk).where(DocumentChunk.doc_id == doc.doc_id))

        chroma_ids: list[str] = []
        chroma_texts: list[str] = []
        embedding_texts: list[str] = []
        embedding_titles: list[str] = []
        chroma_metadatas: list[dict] = []
        db_chunks: list[DocumentChunk] = []

        for i, chunk_payload in enumerate(chunk_items):
            chunk_text_value = str(chunk_payload.get("text") or "").strip()
            if not chunk_text_value:
                continue
            chunk_id = str(uuid.uuid4())
            section_id = chunk_payload.get("section_id")
            section_title = chunk_payload.get("section_title")
            paragraph_start = chunk_payload.get("paragraph_start")
            paragraph_end = chunk_payload.get("paragraph_end")
            chroma_ids.append(chunk_id)
            chroma_texts.append(chunk_text_value)
            embedding_texts.append(build_embedding_text(doc, chunk_text_value))
            embedding_titles.append(doc.title or "Документ")
            chroma_metadatas.append({
                "doc_id": str(doc.doc_id),
                "doc_title": doc.title,
                "doc_type": doc.doc_type,
                **scope_metadata(doc.department_scope),
                "keywords": ",".join(doc.keywords or []),
                "chunk_index": i,
                "section_id": section_id,
                "section_title": section_title,
                "paragraph_start": paragraph_start,
                "paragraph_end": paragraph_end,
            })
            db_chunks.append(DocumentChunk(
                doc_id=doc.doc_id,
                chunk_index=i,
                chunk_text=chunk_text_value,
                chroma_id=chunk_id,
            ))

        vector_batches: list[dict[str, Any]] = []
        if vector_embeddings_available and chroma_ids:
            batch_size = 32
            vector_sync_ready = True
            for batch_start in range(0, len(chroma_ids), batch_size):
                batch_end = min(batch_start + batch_size, len(chroma_ids))
                batch_count = batch_end - batch_start
                batch_embeddings = await embed_texts_async(
                    embedding_texts[batch_start:batch_end],
                    task_type="RETRIEVAL_DOCUMENT",
                    titles=embedding_titles[batch_start:batch_end],
                    allow_remote=True,
                )
                if batch_embeddings is None or len(batch_embeddings) != batch_count:
                    vector_sync_ready = False
                    logger.warning(
                        "Skipping Chroma sync for doc '%s': embedding generation failed for batch %s-%s",
                        doc.title,
                        batch_start,
                        batch_end,
                    )
                    break
                vector_batches.append(
                    {
                        "ids": chroma_ids[batch_start:batch_end],
                        "texts": chroma_texts[batch_start:batch_end],
                        "metadatas": chroma_metadatas[batch_start:batch_end],
                        "embeddings": batch_embeddings,
                    }
                )

            if vector_sync_ready:
                await delete_documents_by_doc_id(str(doc.doc_id))
                for batch in vector_batches:
                    added = await add_documents(
                        ids=batch["ids"],
                        texts=batch["texts"],
                        metadatas=batch["metadatas"],
                        embeddings=batch["embeddings"],
                    )
                    if not added:
                        logger.warning(
                            "Chroma sync failed while adding doc '%s' batch with %s chunks",
                            doc.title,
                            len(batch["ids"]),
                        )
                        break

        db.add_all(db_chunks)
        total_chunks += len(db_chunks)
        logger.info(f"Ingested doc '{doc.title}': {len(db_chunks)} chunks")

    await db.commit()
    logger.info(f"Total chunks ingested: {total_chunks}")
    return total_chunks
