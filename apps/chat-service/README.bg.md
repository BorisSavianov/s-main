# Техническа документация на Chat Service (`chat-service`)

## 1. Преглед на услугата

### Име на услугата
- `chat-service`

### Роля в платформата
- Осигурява чат функционалност в реално време и REST API за разговори, свързани с ментално здраве.
- Поддържа 3 режима на сесии: анонимен AI чат, автентикиран AI чат и чат с консултант.
- Интегрира AI отговори, sentiment/moderation процеси, semantic search и по избор web-enriched отговори.

### Технологичен стек
- Език/runtime: TypeScript, Node.js
- Framework: NestJS
- API стилове: REST + WebSocket (Socket.IO)
- База данни: PostgreSQL (TypeORM)
- Векторна/semantic поддръжка: `pgvector`
- Search engine: Elasticsearch
- Cache/session/queue backend: Redis
- Job processing: Bull
- AI provider: Ollama HTTP API
- Web retrieval: Google Custom Search API + scraping (`cheerio`, `jsdom`/readability)
- Observability: Prometheus, health endpoint-и, request logging interceptor

## 2. Архитектура

### Високо ниво на модулите
- `chat` модул
  - Контролери: session/message/queue/counselor endpoints, file upload
  - Услуги: `ChatService`, `SessionService`, `MessageService`, `CounselorQueueService`, `FileUploadService`
  - Async/event компоненти: `ChatProcessor`, `ChatEventHandlersService`
- `ai` модул
  - Controller: inference/sentiment/summary/moderation/embedding endpoint-и
  - Service: `AIService`, `EnhancedAIService`
  - Async: `AIProcessor`
- `search` модул
  - Controller: text/semantic/hybrid search, analytics, index management
  - Service: `SearchService`
  - Async: `SearchProcessor`, `SearchEventListener`, `MaintenanceService`
- `websocket` модул
  - `WebSocketGateway`, `WebSocketService`, `ConnectionManager`
  - Guard-и: WS auth + throttling
  - Async processors: message-processing, ai-response, analytics
- `web-search` модул
  - Контролери: `WebSearchController`, `WebScraperController`
  - Услуги: Google search adapter, scraper, scraper-AI integration
- `health` модул
  - liveness/readiness/database checks

### Взаимодействие между услуги
- Auth интеграция
  - Импортира auth guard/decorator/strategy от monorepo пътища.
  - Регистрира TCP клиент `AUTH_SERVICE`.
- User интеграция
  - Използва `user-service` entity-та и preference модул.
- Notification интеграция
  - Импортира notification модул/entity-та за crisis/alert сценарии.

### Вътрешна async/event архитектура
- Event bus: `@nestjs/event-emitter`
- Типични събития:
  - `session.created`, `session.ended`, `message.sent`, `message.updated`, `ai.response.generated`, `counselor.queue.*`
- Опашки:
  - `message-processing`, `summary-generation`, `ai-processing`, `chat-processing`, `search-indexing`, `ai-response`, `analytics`

### Патерн request/response
- Глобален prefix: `/api/v1` (без `/metrics`)
- Глобални wrapper-и:
  - Validation pipe (`whitelist`, `forbidNonWhitelisted`, transform)
  - Error filter със стандартизирана JSON грешка
  - Response interceptor: `{ success, data, message, timestamp }`
- Сигурност:
  - JWT + roles + throttler guard-и, с `@Public()` на ниво метод при нужда

### Текстова последователност: съобщение от потребител към AI + индексиране
```text
Client -> POST /api/v1/chat/messages
  -> ChatController валидира достъпа
  -> ChatService записва съобщението в PostgreSQL
  -> Event: message.sent
     -> SearchEventListener enqueue-ва index операция
     -> ChatEventHandlers enqueue-ва moderation/sentiment jobs
  -> Ако senderType=user, ChatService извиква AIService
     -> AIService пази контекст + извиква Ollama
     -> AI съобщението се записва в PostgreSQL
     -> Event: ai.response.generated
Client <- отговор на съобщението
```

### Текстова последователност: свързване с консултант
```text
Counselor -> POST /api/v1/chat/counselor-queue/join
  -> CounselorQueueService записва WAITING ред + Redis set
User -> POST /api/v1/chat/counselor-chat/initiate
  -> Избира се чакащ консултант
  -> Създава се counselor-assisted сесия
  -> Консултантът се маркира като MATCHED
  -> Event: counselor.queue.matched (WS нотификации)
```

## 3. API endpoint-и

Base prefix: `/api/v1`

## Chat REST API (`/chat`)
- `POST /chat/sessions` - създаване на сесия
- `GET /chat/sessions/:sessionId` - детайли за сесия
- `PATCH /chat/sessions/:sessionId` - конвертиране на анонимна в автентикирана
- `POST /chat/messages` - изпращане на съобщение
- `GET /chat/messages` - лист/филтър на съобщения
- `PATCH /chat/messages/:messageId` - редакция (Counselor/Admin)
- `POST /chat/sessions/:sessionId/end` - приключване на сесия
- `GET /chat/users/:userId/sessions` - сесии на потребител
- `GET /chat/sessions/:sessionId/stats` - статистика
- `GET /chat/search/messages` - търсене в съобщения
- `POST /chat/counselor-queue/join` - включване в опашка
- `POST /chat/counselor-queue/leave` - напускане на опашка
- `GET /chat/counselor-queue/status` - статус на консултант
- `GET /chat/counselor-queue/count` - брой налични консултанти
- `POST /chat/counselor-chat/initiate` - стартиране на сесия с консултант
- `POST /chat/counselor-chat/:sessionId/end` - край на counselor сесия

### Пример: създаване на сесия
```http
POST /api/v1/chat/sessions
Content-Type: application/json

{
  "sessionType": "anonymous"
}
```

### Пример: изпращане на съобщение
```http
POST /api/v1/chat/messages
Content-Type: application/json
```

## File API (`/files`)
- Upload/управление на прикачени файлове към чат съобщения.

## AI API (`/ai`)
- Inference, moderation, sentiment, summary, embedding endpoint-и.

## Search API (`/search`)
- Text, semantic, hybrid search, analytics и index операции.

## Web search API (`/web-search`)
- Търсене във външни web източници за enrich на AI отговори.

## Web scraper API (`/web-scraper`)
- Извличане и структуриране на съдържание от външни страници.

## Health/System endpoint-и
- `GET /health`, `GET /health/live`, `GET /health/ready`
- `GET /metrics`

## WebSocket събития
- Connection lifecycle
- Chat message events
- AI response events
- Counselor queue/matching събития

## DTO и валидация
- Строги DTO схеми, трансформации и role-based ограничения.

## Формат на отговор и обработка на грешки
- Стандартизиран response envelope
- Централизиран error filter

## 4. База данни и съхранение

### Основно релационно съхранение (PostgreSQL)
### `chat_sessions`
### `chat_messages`
### `message_attachments`
### `chat_session_summaries`
### `counselor_queue`
### `ai_context`

### Search съхранение (Elasticsearch)
- Индексиране на съобщения/метаданни за бързо търсене.

### Cache/queue/session съхранение (Redis)
- Краткотрайни състояния, rate limiting, queue backend.

### File storage
- Управление на файлове за прикачени ресурси.

## 5. Конфигурация и среда

### Ключови групи променливи
### Core app
- `PORT`, `NODE_ENV`, `GLOBAL_PREFIX`

### Database
- `DATABASE_URL`, `DB_*`

### Redis и queue
- `REDIS_URL`, `REDIS_*`, Bull queue настройки

### AI/Ollama
- `OLLAMA_BASE_URL`, model настройки, timeout-и

### Search
- `ELASTICSEARCH_*`, index имена

### External web search
- `GOOGLE_CUSTOM_SEARCH_*`, `WEB_SEARCH_*`

### Email/alerts
- настройки за нотификации/аларми

### Съображения при deployment
- Скалиране на queue worker-и
- Изолация на WebSocket и API трафика
- Индексиране и lifecycle за Elasticsearch

## 6. Функционални процеси

### Жизнен цикъл на сесия
- Създаване, активност, приключване, трансформация от anonymous към authenticated.

### Генериране на AI отговор
- Контекст -> Ollama -> запис -> публикация към клиент.

### Semantic/hybrid търсене
- Комбинация от vector similarity + keyword сигнали.

### Опашка и matching на консултанти
- Join/leave/status + случайно/правилно разпределение на сесии.

### Валидация и трансформации
- DTO + guard-и + role checks.

## 7. Бележки за производителност и мащабируемост
- Redis/Bull за async обработка
- Elasticsearch за бързо търсене
- WebSocket за минимална латентност
- Разделяне на API и worker натоварване

## 8. Примери за употреба

### Пример: semantic search
```http
GET /api/v1/search/semantic?q=stress%20management
Authorization: Bearer <token>
```

### Пример: включване в counselor queue
```http
POST /api/v1/chat/counselor-queue/join
Authorization: Bearer <token>
```

## 9. Тестване и валидация
- Unit тестове за core service логика
- Частични integration проверки на chat + AI + queue
- Нужда от по-широки E2E тестове за realtime сценарии

## 10. Бележки за интеграция

### Как услугата се вписва в системата
- Получава auth контекст от auth-service
- Ползва user и notification домейни
- Подава event-и към вътрешни async процеси

### Известни ограничения
- AI latency зависи от Ollama model/runtime
- Web scraping изисква устойчивост при външни промени
- Натоварване на WebSocket при висок concurrency

## 11. Обобщение
`chat-service` е централен модул за разговори в реално време, AI асистенция и семантично търсене, с event-driven архитектура и силна интеграция към auth/user/notification подсистемите.
