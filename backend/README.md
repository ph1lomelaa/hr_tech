# GoalAI Platform — Backend

Этот файл описывает backend-only сценарий. Основной входной документ проекта находится в корне репозитория:

- основной README: [../README.md](../README.md)
- архитектура: [../ARCHITECTURE.md](../ARCHITECTURE.md)

## Что находится в `backend/`

- FastAPI API
- ORM-модели, приведённые к структуре хакатонного дампа
- AI-оценка SMART
- AI-генерация целей
- RAG-сервис поверх PostgreSQL + ChromaDB
- аналитика зрелости целеполагания

## Backend-only запуск

### 1. Подготовить окружение

```bash
cd /Users/muslimakosmagambetova/Downloads/hr_tech/backend
cp .env.example .env
```

Минимально заполните:

```env
API_KEY=ваш_ключ_gemini
AUTH_JWT_SECRET=change-me-in-production
```

## 2. Поднять PostgreSQL и ChromaDB

```bash
docker compose up -d postgres chromadb
```

В backend compose:

- PostgreSQL доступен на `localhost:5432`
- ChromaDB доступна на `localhost:8001`

## 3. Загрузить дамп

Из директории `backend/`:

```bash
docker compose exec -T postgres psql -U postgres -d goalai < ../mock_smart_1.sql
```

Если нужен абсолютный путь:

```bash
docker compose exec -T postgres psql -U postgres -d goalai < /Users/muslimakosmagambetova/Downloads/hr_tech/mock_smart_1.sql
```

## 4. Запустить API

```bash
uvicorn app.main:app --reload --port 8000
```

Доступ:

- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## 5. Индексация документов в ChromaDB

Обычно backend сам запускает индексацию на старте, если `document_chunks` ещё нет.

Если нужна ручная переиндексация:

```bash
python scripts/ingest_documents.py
```

## Полезные команды

Логи инфраструктуры:

```bash
docker compose logs -f postgres
docker compose logs -f chromadb
```

Проверка, что backend видит базу:

```bash
curl http://localhost:8000/health
```

## Если генерация или RAG работают плохо

Проверьте:

1. Импортирован ли `../mock_smart_1.sql`.
2. Есть ли в `documents` непустой `content`.
3. Выполнилась ли индексация в ChromaDB.
4. Заполнен ли `API_KEY`.
5. Есть ли исторические цели и цели руководителей в `goals`.
