import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_tables
from app.api.v1 import ai_logs, auth, evaluate, generate, analytics, employees, documents, goals

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
_INGEST_LOCK_ID = 82164128


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting GoalAI Backend...")
    await create_tables()
    logger.info("Database tables created/verified")

    # Auto-ingest VND documents into ChromaDB if not yet indexed
    try:
        from sqlalchemy import func, select as sa_select, text
        from app.models.ai_models import DocumentChunk
        from app.vector_store.ingestion import ingest_all_documents
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await session.execute(text(f"SELECT pg_advisory_lock({_INGEST_LOCK_ID})"))
            try:
                result = await session.execute(sa_select(func.count()).select_from(DocumentChunk))
                chunk_count = result.scalar_one()
                if chunk_count == 0:
                    logger.info("No document chunks found — starting VND ingestion into ChromaDB...")
                    await ingest_all_documents(db=session)
                    logger.info("VND ingestion complete")
                else:
                    logger.info(f"ChromaDB already indexed ({chunk_count} chunks) — skipping ingestion")
            finally:
                await session.execute(text(f"SELECT pg_advisory_unlock({_INGEST_LOCK_ID})"))
    except Exception as e:
        logger.warning(f"Auto-ingestion skipped: {e}")

    yield
    logger.info("Shutting down GoalAI Backend")


app = FastAPI(
    title="GoalAI Platform API",
    description="AI-модуль управления эффективностью персонала. SMART-оценка, генерация целей, аналитика.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(evaluate.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(generate.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(employees.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(goals.router, prefix="/api/v1")
app.include_router(ai_logs.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "service": "GoalAI Platform API",
        "version": "1.0.0",
        "docs": "/docs",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
