"""
Загружает документы из PostgreSQL в ChromaDB.
Запускается один раз: python -m scripts.ingest_documents
"""
import logging
import re
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr_models import Document
from app.models.ai_models import DocumentChunk
from app.vector_store.chroma_client import add_documents, delete_documents_by_doc_id

logger = logging.getLogger(__name__)

CHUNK_MAX_CHARS = 900
SENTENCE_OVERLAP = 2

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_PARAGRAPH_SPLIT_RE = re.compile(r"\n\s*\n+")


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in _PARAGRAPH_SPLIT_RE.split(text) if p.strip()]


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


def chunk_text(text: str) -> list[str]:
    text = normalize_text(text)
    if not text:
        return []

    paragraphs = split_paragraphs(text)
    chunks: list[str] = []
    buffer = ""

    for para in paragraphs:
        if len(para) <= CHUNK_MAX_CHARS:
            if not buffer:
                buffer = para
            elif len(buffer) + 2 + len(para) <= CHUNK_MAX_CHARS:
                buffer = f"{buffer}\n\n{para}"
            else:
                chunks.append(buffer)
                buffer = para
            continue

        if buffer:
            chunks.append(buffer)
            buffer = ""

        sentences = split_sentences(para)
        chunks.extend(chunk_sentences(sentences))

    if buffer:
        chunks.append(buffer)

    return chunks


def build_embedding_text(doc: Document, chunk_text_value: str) -> str:
    parts: list[str] = []
    if doc.doc_type or doc.title:
        label = " ".join([p for p in [doc.doc_type, doc.title] if p]).strip()
        if label:
            parts.append(label)
    if doc.department_scope:
        parts.append(f"Подразделения: {', '.join(doc.department_scope)}")
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

    for doc in documents:
        content = doc.content or ""
        chunks = chunk_text(content)
        if not chunks:
            logger.warning(f"Document '{doc.title}' has no content to ingest")
            continue

        await db.execute(delete(DocumentChunk).where(DocumentChunk.doc_id == doc.doc_id))
        await delete_documents_by_doc_id(str(doc.doc_id))

        chroma_ids: list[str] = []
        chroma_texts: list[str] = []
        chroma_metadatas: list[dict] = []
        db_chunks: list[DocumentChunk] = []

        for i, chunk_text_value in enumerate(chunks):
            chunk_id = str(uuid.uuid4())
            chroma_ids.append(chunk_id)
            chroma_texts.append(build_embedding_text(doc, chunk_text_value))
            chroma_metadatas.append({
                "doc_id": str(doc.doc_id),
                "doc_title": doc.title,
                "doc_type": doc.doc_type,
                "department_scope": ",".join(doc.department_scope or []),
                "keywords": ",".join(doc.keywords or []),
                "chunk_index": i,
            })
            db_chunks.append(DocumentChunk(
                doc_id=doc.doc_id,
                chunk_index=i,
                chunk_text=chunk_text_value,
                chroma_id=chunk_id,
            ))

        batch_size = 100
        for batch_start in range(0, len(chroma_ids), batch_size):
            batch_end = batch_start + batch_size
            await add_documents(
                ids=chroma_ids[batch_start:batch_end],
                texts=chroma_texts[batch_start:batch_end],
                metadatas=chroma_metadatas[batch_start:batch_end],
            )

        db.add_all(db_chunks)
        total_chunks += len(chunks)
        logger.info(f"Ingested doc '{doc.title}': {len(chunks)} chunks")

    await db.commit()
    logger.info(f"Total chunks ingested: {total_chunks}")
    return total_chunks
