# GoalAI Platform
 
AI-модуль для управления эффективностью персонала: SMART-оценка целей, AI-генерация целей на основе ВНД и KPI, контроль набора целей и аналитика зрелости целеполагания.

Проект сделан под хакатон «Внедрение ИИ в HR-процессы» и уже адаптирован под реальную структуру хакатонного PostgreSQL-дампа.

## Материалы проекта

- MVP Website: https://goalhrtech.duckdns.org
- Архитектура: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Отчёт / report команды: [goal_ai report](https://docs.google.com/document/d/1ZZ1ch4__wapC-fvFjMQLcEGUXwz1v65z/edit?usp=sharing&ouid=100437763323418244304&rtpof=true&sd=true)

## Как быстро посмотреть проект

1. Откройте https://goalhrtech.duckdns.org
2. В правом верхнем углу выберите роль через `IdentitySwitcher`
3. Для первого просмотра лучше начать с роли `HR`
4. Дальше пройдите три основных сценария:
   - `Дашборд` и `Аналитика` для общего обзора
   - `Сотрудники` для просмотра карточек сотрудников и их целей
   - `AI Генерация` для генерации и принятия AI-целей


## Что умеет система

- Оценка одной цели по SMART через API и UI.
- Пакетная оценка целей сотрудника за квартал.
- Генерация 3-5 целей на основе должности, подразделения, ВНД и целей руководителя.
- Привязка сгенерированных целей к источникам из документов.
- Проверка набора целей: количество, суммарный вес, дублирование, достижимость.
- Аналитика по подразделениям и компании.
- Переключение ролей `HR / manager / employee` прямо в интерфейсе без внешней IAM-интеграции.

## Стек

| Слой | Технологии |
|------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query |
| Backend | FastAPI, SQLAlchemy async, asyncpg, Pydantic |
| База данных | PostgreSQL 17 |
| Векторная база | ChromaDB 0.5.18 |
| AI / LLM | Gemini + rule-based fallback |
| Embeddings | sentence-transformers + Gemini embeddings fallback |
| Контейнеры | Docker Compose |

## Структура репозитория

```text
hr_tech/
├── frontend/             # React + Vite интерфейс
├── backend/              # FastAPI API, сервисы, RAG, ORM, AI-логика
├── docker-compose.yml    # полный стек: frontend + backend + postgres + chromadb
├── mock_smart_1.sql      # хакатонный дамп PostgreSQL
├── ARCHITECTURE.md       # актуальная архитектура проекта
└── README.md
```

## Быстрый старт через Docker

```bash
cd /Users/muslimakosmagambetova/Downloads/hr_tech
cp backend/.env.example backend/.env
```

Минимум, что нужно заполнить в `backend/.env`:

```env
API_KEY=ваш_ключ_gemini
AUTH_JWT_SECRET=change-me-in-production
```

Если `API_KEY` не задан, проект всё равно запустится, но внешняя LLM будет недоступна и часть AI-сценариев пойдёт через fallback-логику.

### 2. Поднять инфраструктуру

Сначала поднимите только PostgreSQL и ChromaDB:

```bash
docker compose up -d postgres chromadb
```

Почему так: если запустить backend до импорта дампа, он стартанёт без данных и автоиндексация документов пройдёт по пустой базе.

### 3. Импортировать дамп в PostgreSQL

Из корня репозитория:

```bash
docker compose exec -T postgres psql -U postgres -d goalai < ./mock_smart_1.sql
```

Эквивалентная команда с абсолютным путём:

```bash
docker compose exec -T postgres psql -U postgres -d goalai < /Users/muslimakosmagambetova/Downloads/hr_tech/mock_smart_1.sql
```

### 4. Поднять backend и frontend

```bash
docker compose up -d --build backend-api frontend
```

На первом старте backend:

- создаст свои AI-таблицы поверх дампа;
- проверит наличие `document_chunks`;
- если индексации ещё нет, автоматически запустит загрузку документов в ChromaDB;
- поднимет REST API.

Если документов много, первый старт backend может занять заметное время.

### 5. Проверить, что всё работает

Откройте:

- фронтенд: `http://localhost:8080`
- backend docs: `http://localhost:8002/docs`
- healthcheck: `http://localhost:8002/health`

Полезные логи:

```bash
docker compose logs -f backend-api
docker compose logs -f frontend
```

## Что происходит с ChromaDB и RAG

ChromaDB в этом проекте используется как векторное хранилище для ВНД и стратегических документов.

Контур работает так:

1. документы берутся из таблицы `documents` в PostgreSQL;
2. backend режет их на чанки;
3. чанки получают эмбеддинги;
4. эмбеддинги записываются в ChromaDB;
5. метаданные чанков сохраняются в `document_chunks`;
6. RAG использует гибридный поиск: Chroma + лексический поиск по PostgreSQL.

### Когда нужна ручная переиндексация

Ручную переиндексацию стоит запускать, если:

- вы заново импортировали дамп;
- вы меняли содержимое `documents`;
- вы хотите принудительно обновить Chroma и `document_chunks`.

Команда:

```bash
docker compose exec backend-api python scripts/ingest_documents.py
```

## Локальная разработка без полного Docker-стека

Этот режим нужен, если вы хотите отдельно запускать backend и frontend локально.

### Backend-only режим

```bash
cd /Users/muslimakosmagambetova/Downloads/hr_tech/backend
cp .env.example .env
docker compose up -d postgres chromadb
docker compose exec -T postgres psql -U postgres -d goalai < ../mock_smart_1.sql
uvicorn app.main:app --reload --port 8000
```

Если после импорта нужна принудительная переиндексация:

```bash
python scripts/ingest_documents.py
```

Доступ:

- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

### Фронтенд локально

```bash
cd /Users/muslimakosmagambetova/Downloads/hr_tech/frontend
npm install
VITE_API_PROXY=http://localhost:8000 npm run dev
```

По умолчанию локальный фронтенд будет доступен на `http://localhost:8080`.

## Как зайти в систему

В проекте нет отдельной страницы логина с реальными пользователями. Для демо и разработки используется переключение роли внутри интерфейса:

- `HR`
- `manager`
- `employee`

После открытия фронтенда можно выбрать роль и сотрудника через `IdentitySwitcher`.

## Полезные endpoint'ы

| Метод | URL | Что делает |
|-------|-----|------------|
| `GET` | `/api/v1/auth/options` | список доступных ролей и сотрудников |
| `POST` | `/api/v1/auth/impersonate` | переключение роли / актёра |
| `POST` | `/api/v1/evaluate/goal` | оценка одной цели |
| `POST` | `/api/v1/evaluate/batch` | пакетная оценка целей |
| `POST` | `/api/v1/generate/goals` | генерация набора целей |
| `POST` | `/api/v1/generate/accept` | принятие AI-цели |
| `GET` | `/api/v1/documents/search` | гибридный поиск по ВНД |
| `GET` | `/api/v1/analytics/company` | аналитика по компании |

## Если что-то не работает

### Backend поднялся, но документов не видно

Проверьте:

- импортирован ли `mock_smart_1.sql`;
- не запускался ли backend до импорта дампа;
- выполнена ли индексация в Chroma.

Принудительная переиндексация:

```bash
docker compose exec backend-api python scripts/ingest_documents.py
```

### Генерация работает слабо или нестабильно

Проверьте:

- заполнен ли `API_KEY` в `backend/.env`;
- есть ли в `documents` непустые `content`;
- проиндексированы ли документы;
- есть ли в `goals` реальные цели руководителей для выбранного квартала.

### UI открывается, но API не отвечает

Проверьте:

- `http://localhost:8002/health`
- `docker compose logs -f backend-api`
- что фронтенд проксирует в `http://localhost:8002` или `http://backend-api:8000`, в зависимости от режима запуска

## Что ещё посмотреть

- Архитектура: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Backend-only инструкции: [backend/README.md](./backend/README.md)
