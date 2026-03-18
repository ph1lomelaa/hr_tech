from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
import time
from typing import TypeVar

from fastapi import HTTPException

from app.config import settings
from app.security import ActorContext

T = TypeVar("T")

_rate_events: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = asyncio.Lock()

_generate_sem = asyncio.Semaphore(max(1, settings.ai_generate_max_concurrency))
_evaluate_sem = asyncio.Semaphore(max(1, settings.ai_evaluate_max_concurrency))
_batch_sem = asyncio.Semaphore(max(1, settings.ai_batch_max_concurrency))


def _actor_key(actor: ActorContext) -> str:
    employee_token = str(actor.employee_id) if actor.employee_id else "none"
    return f"{actor.role}:{employee_token}"


def _rate_limit_for_bucket(bucket: str) -> int:
    if bucket == "generate":
        return settings.ai_generate_rate_limit_per_minute
    if bucket == "batch":
        return settings.ai_batch_rate_limit_per_minute
    return settings.ai_evaluate_rate_limit_per_minute


def _semaphore_for_bucket(bucket: str) -> asyncio.Semaphore:
    if bucket == "generate":
        return _generate_sem
    if bucket == "batch":
        return _batch_sem
    return _evaluate_sem


async def enforce_ai_rate_limit(actor: ActorContext, bucket: str) -> None:
    limit = _rate_limit_for_bucket(bucket)
    if limit <= 0:
        return

    window_seconds = 60.0
    now = time.monotonic()
    key = f"{bucket}:{_actor_key(actor)}"

    async with _rate_lock:
        events = _rate_events[key]
        while events and (now - events[0]) > window_seconds:
            events.popleft()

        if len(events) >= limit:
            retry_after = int(max(1.0, window_seconds - (now - events[0])))
            raise HTTPException(
                status_code=429,
                detail=f"Too many {bucket} requests. Retry after {retry_after} seconds.",
            )
        events.append(now)


async def run_with_ai_concurrency_guard(
    bucket: str,
    operation: Callable[[], Awaitable[T]],
) -> T:
    semaphore = _semaphore_for_bucket(bucket)
    timeout_seconds = max(1, settings.ai_queue_timeout_seconds)

    try:
        await asyncio.wait_for(semaphore.acquire(), timeout=timeout_seconds)
    except TimeoutError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"AI {bucket} queue is overloaded. Please retry in a few seconds.",
        ) from exc

    try:
        return await operation()
    finally:
        semaphore.release()
