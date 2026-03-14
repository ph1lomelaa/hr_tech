from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_tables
from app.api.v1 import evaluate, generate, analytics, employees, documents, goals

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting GoalAI Backend...")
    await create_tables()
    logger.info("Database tables created/verified")
    yield
    logger.info("Shutting down GoalAI Backend")


app = FastAPI(
    title="GoalAI Platform API",
    description="AI-модуль управления эффективностью персонала. SMART-оценка, генерация целей, аналитика.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — разрешаем фронту обращаться к API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роутеры
app.include_router(evaluate.router, prefix="/api/v1")
app.include_router(generate.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(employees.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(goals.router, prefix="/api/v1")


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
