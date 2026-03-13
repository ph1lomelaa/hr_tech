"""
Загружает документы из PostgreSQL в ChromaDB.
Запускается один раз: python -m scripts.ingest_documents
"""
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr_models import Document
from app.models.ai_models import DocumentChunk
from app.vector_store.chroma_client import add_documents

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500       # символов
CHUNK_OVERLAP = 100    # символов перекрытия


def split_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


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
        chunks = split_text(content)

        chroma_ids = []
        chroma_texts = []
        chroma_metadatas = []
        db_chunks = []

        for i, chunk_text in enumerate(chunks):
            chunk_id = str(uuid.uuid4())
            chroma_ids.append(chunk_id)
            chroma_texts.append(chunk_text)
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
                chunk_text=chunk_text,
                chroma_id=chunk_id,
            ))

        # Батчами по 100
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
