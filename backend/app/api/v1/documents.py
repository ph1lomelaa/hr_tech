from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.hr_models import Document
from app.services.rag_service import search_vnd_hybrid

router = APIRouter(prefix="/documents", tags=["Документы ВНД"])


@router.get("/")
async def list_documents(
    doc_type: str | None = Query(default=None),
    department: str | None = Query(default=None),
    is_active: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
):
    query = select(Document).where(Document.is_active == is_active)
    if doc_type:
        query = query.where(Document.doc_type == doc_type)

    result = await db.execute(query)
    docs = result.scalars().all()

    if department:
        docs = [d for d in docs if not d.department_scope or department in (d.department_scope or [])]

    return [
        {
            "doc_id": str(d.doc_id),
            "doc_type": d.doc_type,
            "title": d.title,
            "version": d.version,
            "valid_from": d.valid_from.isoformat() if d.valid_from else None,
            "valid_to": d.valid_to.isoformat() if d.valid_to else None,
            "department_scope": d.department_scope,
            "keywords": d.keywords,
            "is_active": d.is_active,
        }
        for d in docs
    ]


@router.get("/search")
async def search_vnd(
    q: str = Query(..., min_length=3, description="Поисковый запрос"),
    n: int = Query(default=5, le=20),
    db: AsyncSession = Depends(get_db),
):
    """
    Hybrid RAG-поиск по содержимому ВНД.
    """
    chunks = await search_vnd_hybrid(queries=[q], n_results=n, db=db)
    return {
        "query": q,
        "results": [
            {
                "text": c["text"],
                "doc_title": c["metadata"].get("doc_title"),
                "doc_type": c["metadata"].get("doc_type"),
                "doc_id": c["metadata"].get("doc_id"),
                "relevance": round(c.get("rrf_score", 1 - c.get("distance", 0.5)), 2),
            }
            for c in chunks
        ],
    }


@router.get("/{doc_id}")
async def get_document(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "doc_id": str(doc.doc_id),
        "doc_type": doc.doc_type,
        "title": doc.title,
        "content": doc.content,
        "version": doc.version,
        "valid_from": doc.valid_from.isoformat() if doc.valid_from else None,
        "valid_to": doc.valid_to.isoformat() if doc.valid_to else None,
        "department_scope": doc.department_scope,
        "keywords": doc.keywords,
    }
