# GoalAI Platform

AI-модуль управления эффективностью персонала. Хакатон «Внедрение ИИ в HR-процессы» 2026.

## Структура проекта

```
your-project-hub-main/
├── frontend/       — React + TypeScript + Vite (UI для HR, руководителей, сотрудников)
├── backend/        — FastAPI + PostgreSQL + ChromaDB (AI-оценка и генерация целей)
└── README.md
```

## Быстрый старт

### Фронтенд

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Бэкенд

```bash
cd backend
docker-compose up -d postgres chromadb
pip install -r requirements.txt
cp .env.example .env        # добавить OPENAI_API_KEY
python -m scripts.seed_test_data
python -m scripts.ingest_documents
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs
```

## Стек

| Слой | Технологии |
|------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | FastAPI, SQLAlchemy, asyncpg, Pydantic |
| База данных | PostgreSQL 17 |
| Векторная база | ChromaDB |
| AI / LLM | OpenAI GPT-4o-mini, sentence-transformers |
| Контейнеры | Docker, docker-compose |
