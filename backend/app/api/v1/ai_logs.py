from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.security import get_actor_context
from app.utils.ai_trace import tail_ai_events

router = APIRouter(prefix="/ai/logs", tags=["AI Logs"])


@router.get("/")
async def get_ai_logs(
    request: Request,
    limit: int = Query(default=100, ge=1, le=1000),
    event: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_actor_context(request, db, require_employee_for_non_hr=False)
    if actor.role != "hr":
        raise HTTPException(status_code=403, detail="Only HR can access AI logs")

    return {
        "items": tail_ai_events(limit=limit, event=event),
    }
