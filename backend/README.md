# GoalAI Platform — Backend

FastAPI бэкенд для AI-модуля управления эффективностью персонала.

## Быстрый старт

### 1. Установка зависимостей

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Настройка окружения

```bash
cp .env.example .env
# Заполни OPENAI_API_KEY в .env
```

### 3. Запуск через Docker (рекомендуется)

```bash
docker-compose up -d
```

### 4. Или запуск локально

```bash
# Запусти PostgreSQL и ChromaDB через docker-compose:
docker-compose up -d postgres chromadb

# Загрузи тестовые данные:
python -m scripts.seed_test_data

# Заполни векторную базу (RAG):
python -m scripts.ingest_documents

# Запусти API:
uvicorn app.main:app --reload --port 8000
```

### 5. Документация API

Открой в браузере: http://localhost:8000/docs

## Основные эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| POST | /api/v1/evaluate/goal | SMART-оценка одной цели |
| POST | /api/v1/evaluate/batch | Пакетная оценка за квартал |
| POST | /api/v1/generate/goals | Генерация 3-5 целей |
| POST | /api/v1/generate/accept | Принять сгенерированную цель |
| POST | /api/v1/generate/rewrite | Переформулировать цель |
| GET | /api/v1/analytics/company | Дашборд компании |
| GET | /api/v1/analytics/department/{id} | Дашборд подразделения |
| GET | /api/v1/employees/{id}/goals | Цели сотрудника |
| GET | /api/v1/documents/search?q=... | RAG-поиск по ВНД |

## Тестовые данные

После `seed_test_data.py`:

```
HR директор:  30000000-0000-0000-0000-000000000001
Руководитель: 30000000-0000-0000-0000-000000000002
Сотрудник:    30000000-0000-0000-0000-000000000003
Отдел продаж: 10000000-0000-0000-0000-000000000005
```

## Пример запроса

```bash
curl -X POST http://localhost:8000/api/v1/evaluate/goal \
  -H "Content-Type: application/json" \
  -d '{
    "goal_text": "Улучшить работу с клиентами",
    "position": "Менеджер по продажам",
    "department": "Продажи"
  }'
```

## На хакатоне

При получении дампа БД организаторов:
```bash
psql -U postgres -d goalai < hackathon_dump.sql
python -m scripts.ingest_documents  # переиндексировать реальные ВНД
```
