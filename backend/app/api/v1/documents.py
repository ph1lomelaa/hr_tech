from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.ai_models import DocumentReview
from app.models.hr_models import Department, Document
from app.security import ActorContext, get_actor_context
from app.services.rag_service import search_vnd_hybrid
from app.utils.document_scope import department_scope_matches

router = APIRouter(prefix="/documents", tags=["Документы ВНД"])
ALLOWED_DOCUMENT_VERDICTS = {"approved", "rejected"}


async def _resolve_department_context(
    actor: ActorContext,
    department_filter: str | None,
    db: AsyncSession,
) -> tuple[list[str], list[int]]:
    aliases: list[str] = []
    department_ids: list[int] = []
    if department_filter:
        aliases.append(department_filter)

    if actor.employee and actor.employee.department_id:
        department_ids.append(actor.employee.department_id)
        result = await db.execute(
            select(Department).where(Department.id == actor.employee.department_id)
        )
        department = result.scalar_one_or_none()
        if department:
            aliases.append(department.name)
            if department.code:
                aliases.append(department.code)
    aliases = list(dict.fromkeys(v for v in aliases if str(v).strip()))
    department_ids = list(dict.fromkeys(v for v in department_ids if v is not None))
    return aliases, department_ids


def _serialize_review(review: DocumentReview) -> dict:
    return {
        "id": str(review.id),
        "doc_id": str(review.doc_id),
        "reviewer_id": str(review.reviewer_id) if review.reviewer_id else None,
        "reviewer_role": review.reviewer_role,
        "stage": review.stage,
        "verdict": review.verdict,
        "comment": review.comment,
        "created_at": review.created_at.isoformat(),
    }


def _compute_approval_status(
    manager_review: DocumentReview | None,
    hr_review: DocumentReview | None,
) -> str:
    if hr_review:
        return "approved" if hr_review.verdict == "approved" else "rejected"
    if manager_review:
        if manager_review.verdict == "approved":
            return "manager_approved"
        return "manager_rejected"
    return "pending"


async def _get_latest_stage_review(
    *,
    doc_id: UUID,
    stage: str,
    db: AsyncSession,
) -> DocumentReview | None:
    result = await db.execute(
        select(DocumentReview)
        .where(DocumentReview.doc_id == doc_id, DocumentReview.stage == stage)
        .order_by(DocumentReview.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_reviews_by_doc(
    *,
    doc_ids: list[UUID],
    db: AsyncSession,
) -> dict[UUID, dict[str, DocumentReview | None]]:
    if not doc_ids:
        return {}

    result = await db.execute(
        select(DocumentReview)
        .where(DocumentReview.doc_id.in_(doc_ids))
        .order_by(DocumentReview.created_at.desc())
    )
    reviews = result.scalars().all()
    latest_by_key: dict[tuple[UUID, str], DocumentReview] = {}
    for review in reviews:
        key = (review.doc_id, review.stage)
        if key not in latest_by_key:
            latest_by_key[key] = review

    by_doc: dict[UUID, dict[str, DocumentReview | None]] = {}
    for doc_id in doc_ids:
        by_doc[doc_id] = {
            "manager": latest_by_key.get((doc_id, "manager")),
            "hr": latest_by_key.get((doc_id, "hr")),
        }
    return by_doc


@router.get("/")
async def list_documents(
    request: Request,
    doc_type: str | None = Query(default=None),
    department: str | None = Query(default=None),
    is_active: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    query = select(Document).where(Document.is_active == is_active)
    if doc_type:
        query = query.where(Document.doc_type == doc_type)

    result = await db.execute(query)
    docs = result.scalars().all()

    department_aliases, department_ids = await _resolve_department_context(actor, department, db)
    if department_aliases:
        docs = [
            d for d in docs
            if department_scope_matches(
                d.department_scope,
                aliases=department_aliases,
                department_ids=department_ids,
            )
        ]

    reviews_by_doc = await _get_reviews_by_doc(
        doc_ids=[d.doc_id for d in docs],
        db=db,
    )

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
            "approval_status": _compute_approval_status(
                manager_review=(reviews_by_doc.get(d.doc_id) or {}).get("manager"),
                hr_review=(reviews_by_doc.get(d.doc_id) or {}).get("hr"),
            ),
        }
        for d in docs
    ]


@router.get("/search")
async def search_vnd(
    request: Request,
    q: str = Query(..., min_length=3, description="Поисковый запрос"),
    n: int = Query(default=5, le=20),
    db: AsyncSession = Depends(get_db),
):
    """
    Hybrid RAG-поиск по содержимому ВНД.
    """
    actor = await get_actor_context(request, db)
    department_aliases, department_ids = await _resolve_department_context(actor, None, db)
    rag_department_aliases = department_aliases if actor.role != "hr" and department_aliases else None
    chunks = await search_vnd_hybrid(
        queries=[q],
        n_results=n,
        db=db,
        department_aliases=rag_department_aliases,
        department_ids=department_ids if actor.role != "hr" else None,
    )

    if actor.role != "hr" and department_aliases:
        chunks = [
            c for c in chunks
            if department_scope_matches(
                c.get("metadata", {}).get("department_scope"),
                aliases=department_aliases,
                department_ids=department_ids,
            )
        ]
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
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if actor.role != "hr":
        department_aliases, department_ids = await _resolve_department_context(actor, None, db)
        if department_aliases and not department_scope_matches(
            doc.department_scope,
            aliases=department_aliases,
            department_ids=department_ids,
        ):
            raise HTTPException(status_code=403, detail="You cannot access this document")

    latest_manager_review = await _get_latest_stage_review(doc_id=doc.doc_id, stage="manager", db=db)
    latest_hr_review = await _get_latest_stage_review(doc_id=doc.doc_id, stage="hr", db=db)

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
        "is_active": doc.is_active,
        "approval_status": _compute_approval_status(
            manager_review=latest_manager_review,
            hr_review=latest_hr_review,
        ),
        "latest_manager_review": _serialize_review(latest_manager_review) if latest_manager_review else None,
        "latest_hr_review": _serialize_review(latest_hr_review) if latest_hr_review else None,
    }


@router.get("/{doc_id}/approvals")
async def get_document_approvals(
    doc_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if actor.role != "hr":
        department_aliases, department_ids = await _resolve_department_context(actor, None, db)
        if department_aliases and not department_scope_matches(
            doc.department_scope,
            aliases=department_aliases,
            department_ids=department_ids,
        ):
            raise HTTPException(status_code=403, detail="You cannot access this document approvals")

    result = await db.execute(
        select(DocumentReview)
        .where(DocumentReview.doc_id == doc_id)
        .order_by(DocumentReview.created_at.desc())
    )
    reviews = result.scalars().all()
    latest_manager = next((r for r in reviews if r.stage == "manager"), None)
    latest_hr = next((r for r in reviews if r.stage == "hr"), None)

    return {
        "doc_id": str(doc_id),
        "approval_status": _compute_approval_status(
            manager_review=latest_manager,
            hr_review=latest_hr,
        ),
        "latest_manager_review": _serialize_review(latest_manager) if latest_manager else None,
        "latest_hr_review": _serialize_review(latest_hr) if latest_hr else None,
        "history": [_serialize_review(r) for r in reviews],
    }


@router.post("/{doc_id}/approvals")
async def approve_document(
    doc_id: UUID,
    body: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db)
    if actor.role == "employee":
        raise HTTPException(status_code=403, detail="Employees cannot approve documents")

    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    verdict = str(body.get("verdict", "")).strip().lower()
    if verdict not in ALLOWED_DOCUMENT_VERDICTS:
        raise HTTPException(status_code=422, detail="verdict must be 'approved' or 'rejected'")
    comment = body.get("comment")

    if actor.role == "manager":
        if actor.employee is None or actor.employee_id is None:
            raise HTTPException(status_code=401, detail="Manager actor is not linked to employee profile")
        if doc.owner_department_id:
            if actor.employee.department_id != doc.owner_department_id:
                raise HTTPException(
                    status_code=403,
                    detail="Managers can review documents only for their own department",
                )
        else:
            manager_aliases, manager_department_ids = await _resolve_department_context(actor, None, db)
            if not department_scope_matches(
                doc.department_scope,
                aliases=manager_aliases,
                department_ids=manager_department_ids,
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Managers can review only documents matching their department scope",
                )
        stage = "manager"
    else:
        stage = "hr"
        if verdict == "approved" and doc.owner_department_id:
            latest_manager = await _get_latest_stage_review(doc_id=doc_id, stage="manager", db=db)
            if latest_manager is None or latest_manager.verdict != "approved":
                raise HTTPException(
                    status_code=409,
                    detail="HR approval requires an approved manager review first",
                )

    review = DocumentReview(
        doc_id=doc.doc_id,
        reviewer_id=actor.employee_id,
        reviewer_role=actor.role,
        stage=stage,
        verdict=verdict,
        comment=comment,
    )
    db.add(review)

    if stage == "hr":
        doc.is_active = verdict == "approved"

    await db.commit()
    await db.refresh(review)

    latest_manager = review if review.stage == "manager" else await _get_latest_stage_review(doc_id=doc_id, stage="manager", db=db)
    latest_hr = review if review.stage == "hr" else await _get_latest_stage_review(doc_id=doc_id, stage="hr", db=db)

    return {
        "review": _serialize_review(review),
        "approval_status": _compute_approval_status(
            manager_review=latest_manager,
            hr_review=latest_hr,
        ),
        "is_active": doc.is_active,
    }
