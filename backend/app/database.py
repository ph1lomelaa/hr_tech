from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=max(1, settings.db_pool_size),
    max_overflow=max(0, settings.db_pool_max_overflow),
    pool_timeout=max(1, settings.db_pool_timeout_seconds),
    pool_recycle=max(30, settings.db_pool_recycle_seconds),
    pool_pre_ping=settings.db_pool_pre_ping,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

_PERFORMANCE_INDEXES: tuple[str, ...] = (
    "CREATE INDEX IF NOT EXISTS ix_goals_employee_period ON goals (employee_id, year, quarter)",
    "CREATE INDEX IF NOT EXISTS ix_goals_department_period ON goals (department_id, year, quarter)",
    "CREATE INDEX IF NOT EXISTS ix_goals_status_period ON goals (status, year, quarter)",
    "CREATE INDEX IF NOT EXISTS ix_goal_events_goal_created ON goal_events (goal_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_goal_reviews_goal_created ON goal_reviews (goal_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_employees_manager_active ON employees (manager_id, is_active)",
    "CREATE INDEX IF NOT EXISTS ix_employees_department_active ON employees (department_id, is_active)",
    "CREATE INDEX IF NOT EXISTS ix_goal_alerts_employee_read_created ON goal_alerts (employee_id, is_read, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_suggested_goals_employee_status_created ON suggested_goals (employee_id, status, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_generation_sessions_employee_period ON generation_sessions (employee_id, year, quarter)",
    "CREATE INDEX IF NOT EXISTS ix_document_reviews_doc_stage_created ON document_reviews (doc_id, stage, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_document_chunks_doc_chunk ON document_chunks (doc_id, chunk_index)",
    "CREATE INDEX IF NOT EXISTS ix_document_chunks_fts_ru ON document_chunks USING GIN (to_tsvector('russian', chunk_text))",
)
_SCHEMA_BOOTSTRAP_LOCK_ID = 82164127


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def create_tables():
    async with engine.begin() as conn:
        await conn.execute(text(f"SELECT pg_advisory_lock({_SCHEMA_BOOTSTRAP_LOCK_ID})"))
        try:
            from app.models import ai_models  # noqa: F401
            from app.models import hr_models  # noqa: F401
            await conn.run_sync(Base.metadata.create_all)
            for ddl in _PERFORMANCE_INDEXES:
                await conn.execute(text(ddl))
        finally:
            await conn.execute(text(f"SELECT pg_advisory_unlock({_SCHEMA_BOOTSTRAP_LOCK_ID})"))
