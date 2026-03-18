
## 1. GoalAI Platform

Система решает четыре прикладные задачи:

1. Оценка качества целей по SMART и смежным критериям.
2. Генерация целей на основе ВНД, KPI и целей руководителя.
3. Контроль набора целей: количество, веса, дубли, достижимость и стратегическая связка.
4. Агрегированная аналитика зрелости целеполагания по подразделениям и компании.

---

## 2. Контур выполнения

```text
Браузер
  │
  ▼
Фронтенд (React + Vite, :8080)
  │   относительные запросы /api/v1 через прокси Vite
  ▼
API-бэкенд (FastAPI, :8000 внутри контейнера / :8002 на хосте)
  │
  ├─ PostgreSQL 17 (:5432)
  ├─ ChromaDB 0.5.18 (:8000 внутри docker-сети)
  └─ Внешние LLM API
       ├─ Anthropic
       ├─ Gemini
       └─ OpenAI
```

Ключевой момент: фронтенд не использует жёстко зашитый URL бэкенда. API-клиент работает через относительный `BASE = "/api/v1"`, а фактический адрес назначения задаётся через прокси Vite.

В репозитории поддерживаются два основных режима запуска:

1. Полный стек через [`docker-compose.yml`](/Users/muslimakosmagambetova/Downloads/hr_tech/docker-compose.yml): фронтенд + бэкенд + postgres + chromadb.
2. Отдельный бэкенд через [`backend/docker-compose.yml`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/docker-compose.yml): api + postgres + chromadb для локальной разработки серверной части.

---

## 3. Технологический стек

### Бэкенд

| Слой | Технология | Версия |
|------|------|------|
| API | FastAPI | 0.115.0 |
| ASGI | Uvicorn | 0.30.6 |
| ORM | SQLAlchemy async | 2.0.36 |
| Драйвер PostgreSQL | asyncpg | 0.30.0 |
| Валидация | Pydantic | 2.9.2 |
| Settings | pydantic-settings | 2.6.0 |
| HTTP-клиент | httpx | 0.27.2 |

### AI / NLP

| Слой | Технология | Примечание |
|------|------|------|
| Основной LLM-приоритет | Anthropic | если задан `ANTHROPIC_API_KEY` |
| Второй LLM-приоритет | Gemini | если задан `API_KEY` |
| Третий LLM-приоритет | OpenAI | если задан `OPENAI_API_KEY` |
| Локальные эмбеддинги | sentence-transformers | `paraphrase-multilingual-MiniLM-L12-v2` |
| Удалённый резервный путь для эмбеддингов | Gemini embeddings | `models/gemini-embedding-001` |
| Векторная база | ChromaDB | гибридный RAG + лексический поиск по Postgres |

### Фронтенд

| Слой | Технология |
|------|------|
| UI | React 18 + TypeScript |
| Сборка и сервер разработки | Vite |
| Стилизация | Tailwind CSS |
| Компоненты | shadcn/ui |
| Работа с данными | TanStack Query |
| Маршрутизация | React Router |
| Анимации | Framer Motion |

---

## 4. Docker и запуск

### 4.1 Полный compose

Корневой [`docker-compose.yml`](/Users/muslimakosmagambetova/Downloads/hr_tech/docker-compose.yml) поднимает четыре сервиса:

```yaml
services:
  backend-api:
    build: ./backend
    ports:
      - "8002:8000"
    env_file:
      - ./backend/.env
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@postgres:5432/goalai
      CHROMA_HOST: chromadb
      CHROMA_PORT: 8000

  frontend:
    build: ./frontend
    ports:
      - "8080:8080"
    environment:
      VITE_API_PROXY: http://backend-api:8000

  postgres:
    image: postgres:17
    ports:
      - "5432:5432"

  chromadb:
    image: chromadb/chroma:0.5.18
```

### 4.2 Важные детали запуска

1. Бэкенд слушает `8000` внутри контейнера и публикуется как `8002` на хосте.
2. ChromaDB внутри docker-сети адресуется как `chromadb:8000`.
3. `backend/.env` продолжает использоваться, но docker-compose переопределяет DB/Chroma-параметры для контейнерного режима.
4. Фронтенд в контейнере работает в режиме разработки с горячей перезагрузкой.

### 4.3 Отдельный compose для бэкенда

[`backend/docker-compose.yml`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/docker-compose.yml) предназначен для backend-ориентированной разработки:

- `api` публикуется на `8002`
- `postgres` публикуется на `5432`
- `chromadb` публикуется на `8001 -> 8000`

Именно этот режим соответствует [`backend/.env.example`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/.env.example), если бэкенд запускается локально вне контейнера.

---

## 5. Переменные окружения

Актуальные настройки бэкенда находятся в [`backend/app/config.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/config.py).

### 5.1 Локальный бэкенд поверх `backend/docker-compose.yml`

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/goalai
CHROMA_HOST=localhost
CHROMA_PORT=8001
CHROMA_COLLECTION=vnd_documents

API_KEY=...              # Gemini
OPENAI_API_KEY=...       # опционально
ANTHROPIC_API_KEY=...    # опционально

EMBEDDING_MODEL=paraphrase-multilingual-MiniLM-L12-v2
AUTH_JWT_SECRET=change-me-in-production
```

### 5.2 Бэкенд внутри compose-сети

Когда сам API работает внутри compose, значения подключения переопределяются и должны быть такими:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/goalai
CHROMA_HOST=chromadb
CHROMA_PORT=8000
```

### 5.3 Операционные AI-настройки

- `SMART_THRESHOLD`
- `MIN_GOALS`
- `MAX_GOALS`
- `DUPLICATE_SIMILARITY_THRESHOLD`
- `AI_*_MAX_CONCURRENCY`
- `AI_*_RATE_LIMIT_PER_MINUTE`
- `ANALYTICS_CACHE_TTL_SECONDS`
- `LLM_CACHE_TTL_SECONDS`
- `LLM_PROVIDER_COOLDOWN_SECONDS`

---

## 6. Структура бэкенда

```text
backend/app/
├── main.py
├── config.py
├── database.py
├── security.py
├── auth_jwt.py
├── ai_guardrails.py
│
├── api/v1/
│   ├── auth.py
│   ├── goals.py
│   ├── evaluate.py
│   ├── generate.py
│   ├── employees.py
│   ├── documents.py
│   ├── analytics.py
│   └── ai_logs.py
│
├── services/
│   ├── smart_evaluator.py
│   ├── goal_generator.py
│   ├── analytics_service.py
│   ├── rag_service.py
│   ├── goal_quality_rules.py
│   └── rule_based_evaluator.py
│
├── ai/
│   ├── llm_client.py
│   ├── embeddings.py
│   └── prompts.py
│
├── vector_store/
│   ├── chroma_client.py
│   └── ingestion.py
│
├── models/
│   ├── hr_models.py
│   └── ai_models.py
│
├── schemas/
│   ├── evaluation.py
│   ├── generation.py
│   └── analytics.py
│
└── utils/
    ├── ai_trace.py
    ├── citation.py
    ├── document_scope.py
    └── goal_fields.py
```

---

## 7. Жизненный цикл запуска бэкенда

`lifespan` в [`backend/app/main.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/main.py) на старте делает следующее:

1. Запускает `create_tables()` для AI-таблиц расширения и performance-индексов.
2. Проверяет, есть ли уже `document_chunks`.
3. Если чанков нет, автоматически запускает ingestion документов в Postgres и Chroma.
4. Использует advisory lock PostgreSQL, чтобы не было двойного bootstrap и ingestion при параллельных стартах.

Это означает, что проект не зависит от отдельной инициализации через `schema.sql`. Он поднимает свои AI-структуры поверх импортированного хакатонного дампа.

---

## 8. Модель авторизации и доступа

### 8.1 Аутентификация

Проект использует собственные подписанные bearer-токены JWT-like, реализованные в [`backend/app/auth_jwt.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/auth_jwt.py).

Основные маршруты авторизации:

- `POST /api/v1/auth/impersonate`
- `GET /api/v1/auth/options`
- `GET /api/v1/auth/whoami`

### 8.2 Роли

- `hr`
- `manager`
- `employee`

### 8.3 Правила доступа

Правила описаны в [`backend/app/security.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/security.py):

1. `hr` имеет доступ ко всем данным.
2. `manager` имеет доступ к себе и прямым подчинённым в операциях, привязанных к сотруднику.
3. `employee` имеет доступ только к собственным данным.
4. Для части ресурсов правила уже, чем общий доступ:
   - уведомления сотрудников недоступны менеджеру от имени подчинённого;
   - аналитика по компании доступна только HR;
   - аналитика по департаменту для менеджера ограничена его департаментом;
   - согласование документов идёт по стадиям: `manager`, затем `hr`.

### 8.4 UX авторизации на фронтенде

Фронтенд хранит состояние выбранной роли и актёра в localStorage и переключает его через `IdentitySwitcher`.

Это не временный debug-механизм, а важная часть демонстрационного и продуктового сценария.

---

## 9. AI-слой

### 9.1 Стратегия вызова LLM

[`backend/app/ai/llm_client.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/ai/llm_client.py) реализует следующий порядок:

1. Anthropic.
2. Gemini.
3. OpenAI.
4. Правило-ориентированный fallback на уровне сервисов, если ни один провайдер не дал пригодный результат.

### 9.2 Механизмы надёжности

- восстановление и очистка JSON-ответов;
- удаление markdown-блоков;
- устойчивый разбор JSON;
- TTL-кэш в памяти;
- cooldown для провайдера после повторяющихся ошибок;
- trace-логирование в `logs/ai_trace.jsonl`.

### 9.3 Эмбеддинги

[`backend/app/ai/embeddings.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/ai/embeddings.py):

1. сначала пытается использовать локальную модель `sentence-transformers`;
2. если локальная модель недоступна, при наличии `API_KEY` может использовать асинхронные Gemini embeddings.

Итоговая стратегия эмбеддингов смешанная:

- основной путь: локальная multilingual MiniLM;
- резервный путь: Gemini embeddings API.

---

## 10. RAG-пайплайн

Контур извлечения документов гибридный:

1. построение запроса в сервисном слое;
2. векторное извлечение из ChromaDB;
3. лексическое извлечение из PostgreSQL по `document_chunks`;
4. объединение и скоринг результатов;
5. фильтрация по scope департамента;
6. формирование контекста для prompt'ов генерации и оценки.

### 10.1 Индексируемые артефакты

- коллекция Chroma: `vnd_documents`
- лексическая таблица Postgres: `document_chunks`

### 10.2 Задачи ingestion

[`backend/app/vector_store/ingestion.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/vector_store/ingestion.py):

- загружает активные документы;
- нормализует текст;
- режет документы на чанки;
- генерирует эмбеддинги;
- записывает данные в ChromaDB;
- сохраняет метаданные чанков в PostgreSQL.

---

## 11. Модель данных

Система использует два уровня данных:

1. схему дампа организаторов;
2. AI-таблицы расширения, создаваемые самим приложением.

### 11.1 Основные модели HR-дампа

#### departments

- `id bigint`
- `name`
- `code`
- `parent_id`
- `is_active`
- timestamps

#### positions

- `id bigint`
- `name`
- `grade`
- timestamps

#### employees

- `id bigint`
- `employee_code`
- `full_name`
- `email`
- `department_id`
- `position_id`
- `manager_id`
- `hire_date`
- `is_active`
- timestamps

#### documents

- `doc_id uuid`
- `doc_type enum`
- `title`
- `content`
- `valid_from`
- `valid_to`
- `owner_department_id`
- `department_scope jsonb`
- `keywords text[]`
- `version`
- `is_active`
- timestamps

#### goals

- `goal_id uuid`
- `employee_id bigint`
- `department_id bigint`
- `employee_name_snapshot`
- `position_snapshot`
- `department_name_snapshot`
- `project_id uuid`
- `system_id bigint`
- `goal_text`
- `year`
- `quarter`
- `metric`
- `deadline`
- `weight`
- `status`
- `external_ref`
- `priority`
- timestamps

Для совместимости в ORM сохранены алиасы:

- `Goal.id -> goal_id`
- `Goal.title -> goal_text`
- `Goal.description -> goal_text`

#### goal_events

- `id uuid`
- `goal_id`
- `event_type`
- `actor_id`
- `old_status`
- `new_status`
- `old_text`
- `new_text`
- `metadata`
- `created_at`

#### goal_reviews

- `id uuid`
- `goal_id`
- `reviewer_id`
- `verdict`
- `comment_text`
- `created_at`

#### kpi_catalog

- первичный ключ — `metric_key`
- ORM-алиасы:
  - `id -> metric_key`
  - `name/title` сопоставлены для совместимости

#### kpi_timeseries

- `metric_key`
- `period_date`
- `value_num`
- `scope_type`
- опциональные связи с департаментом, сотрудником, проектом и системой

### 11.2 AI-таблицы расширения

Описаны в [`backend/app/models/ai_models.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/models/ai_models.py):

- `smart_evaluations`
- `generation_sessions`
- `suggested_goals`
- `goal_sources`
- `document_reviews`
- `document_chunks`
- `department_maturity_cache`
- `goal_alerts`

### 11.3 Почему это важно

Архитектура здесь намеренно не «greenfield». Она адаптируется к дампу организаторов, а не заменяет его собственной схемой.

Это одно из ключевых инженерных решений проекта.

---

## 12. Поверхность API

Базовый префикс: `/api/v1`

### 12.1 Авторизация

- `POST /auth/impersonate`
- `GET /auth/options`
- `GET /auth/whoami`

### 12.2 Цели

- `GET /goals`
- `POST /goals`
- `GET /goals/{goal_id}`
- `PATCH /goals/{goal_id}/status`
- `GET /goals/{goal_id}/events`
- `DELETE /goals/{goal_id}`

### 12.3 Оценка

- `POST /evaluate/goal`
- `POST /evaluate/goal/{goal_id}`
- `POST /evaluate/batch`
- `POST /evaluate/backfill`

### 12.4 Генерация

- `POST /generate/goals`
- `POST /generate/accept`
- `POST /generate/rewrite`
- `POST /generate/reject`

### 12.5 Сотрудники

- `GET /employees`
- `GET /employees/{employee_id}`
- `GET /employees/{employee_id}/goals`
- `GET /employees/{employee_id}/manager-goals`
- `GET /employees/{employee_id}/alerts`
- `PATCH /employees/{employee_id}/alerts/{alert_id}/read`

### 12.6 Документы

- `GET /documents`
- `GET /documents/search`
- `GET /documents/{doc_id}`
- `GET /documents/{doc_id}/approvals`
- `POST /documents/{doc_id}/approvals`

### 12.7 Аналитика

- `GET /analytics/department/{department_id}`
- `GET /analytics/company`
- `POST /analytics/refresh`

### 12.8 AI-логи

- `GET /ai/logs`

---

## 13. Архитектура фронтенда

### 13.1 Каркас приложения

Ключевой каркас интерфейса:

- `DashboardLayout.tsx`
- сайдбар и верхняя панель, зависящие от роли
- переключение темы
- `IdentitySwitcher` для переключения роли и актёра

### 13.2 Маршруты

Маршруты определены в [`frontend/src/App.tsx`](/Users/muslimakosmagambetova/Downloads/hr_tech/frontend/src/App.tsx).

#### Публичная часть

- `/` → `LandingPage`

#### HR

- `/hr`
- `/hr/goals`
- `/hr/goals/:goalId`
- `/hr/generate`
- `/hr/documents`
- `/hr/employees`
- `/hr/analytics`

#### Manager

- `/manager`
- `/manager/team-goals`
- `/manager/team-goals/:goalId`
- `/manager/my-goals`
- `/manager/generate`
- `/manager/documents`
- `/manager/feedback`
- `/manager/employees`

#### Employee

- `/employee`
- `/employee/goals`
- `/employee/goals/:goalId`
- `/employee/generate`
- `/employee/documents`
- `/employee/feedback`

### 13.3 Доступ к данным на фронтенде

Обёртка над API находится в [`frontend/src/lib/api.ts`](/Users/muslimakosmagambetova/Downloads/hr_tech/frontend/src/lib/api.ts).

Ключевые детали:

1. Используется относительный `BASE = "/api/v1"`.
2. Начальная выдача bearer-токена идёт через `/auth/impersonate`.
3. Выбранный сотрудник хранится раздельно по ролям в localStorage.
4. Основной слой кэша и оркестрации построен на React Query.

---

## 14. Основные бизнес-потоки

### 14.1 Переключение роли / демо-доступ

1. UI загружает `/auth/options`.
2. Пользователь выбирает `hr`, `manager` или `employee`.
3. Фронтенд вызывает `/auth/impersonate`.
4. Токен сохраняется локально.
5. Все последующие API-запросы идут в контексте выбранного актёра.

### 14.2 SMART-оценка

1. Пользователь отправляет свободный текст цели или выбирает цель из БД.
2. Бэкенд обогащает контекст данными сотрудника, департамента и RAG-контекстом.
3. Сервис оценки вызывает LLM, если это возможно.
4. Если ответ провайдера невалиден или недоступен, используется правило-ориентированный fallback.
5. Результат сохраняется в `smart_evaluations`.

### 14.3 Генерация целей

1. Выбирается целевой сотрудник.
2. При необходимости подгружаются цели руководителя для каскадирования.
3. Релевантные документы извлекаются через гибридный RAG.
4. LLM генерирует 3-5 кандидатных целей.
5. Каждая цель проходит SMART-проверку и дополнительные проверки предупреждений.
6. Предложения сохраняются в `suggested_goals`.
7. Пользователь принимает или отклоняет предложения.
8. Принятая рекомендация становится реальной записью `goal` и получает связку `goal_source`.

### 14.4 Аналитика

1. Сервис аналитики агрегирует уже оценённые цели.
2. Считает индекс зрелости, слабые критерии и распределение типов целей.
3. Кэширует результат в `department_maturity_cache`.
4. `refresh=true` или `/analytics/refresh` принудительно запускают пересчёт.

### 14.5 Согласование документов

1. Документы фильтруются по области доступа актёра.
2. Менеджер может согласовывать только документы своего департамента.
3. HR может финализировать согласование.
4. История согласований хранится в `document_reviews`.

---

## 15. Производительность и guardrails

### 15.1 Инициализация базы данных

[`backend/app/database.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/database.py) создаёт AI-таблицы и performance-индексы на старте.

Примеры индексов:

- индексы целей по сотруднику и периоду
- индексы целей по департаменту и периоду
- индексы алертов по сотруднику и статусу прочтения
- FTS-индекс для document chunks

### 15.2 AI guardrails

[`backend/app/ai_guardrails.py`](/Users/muslimakosmagambetova/Downloads/hr_tech/backend/app/ai_guardrails.py) применяет:

- rate limits по bucket (`generate`, `evaluate`, `batch`);
- отдельные семафоры по bucket;
- защиту через ограничение ожидания в очереди.

### 15.3 Устойчивость LLM-слоя

- попадания в кэш для повторяющихся prompt'ов;
- cooldown провайдера после сбоев;
- восстановление JSON перед fallback;
- правило-ориентированный fallback-маршрут.


