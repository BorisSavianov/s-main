# Chat Service (`chat-service`) - Technical Documentation

## 1. Service Overview

### Service name
- `chat-service`

### Purpose in the platform
- Provides real-time and REST-based chat capabilities for mental-health support conversations.
- Supports three session modes: anonymous AI chat, authenticated AI chat, and counselor-assisted chat.
- Integrates AI response generation, sentiment/moderation workflows, semantic search, and optional web-enriched responses.

### Technology stack
- Language/runtime: TypeScript, Node.js
- Framework: NestJS (modular monorepo app)
- API styles: REST + WebSocket (Socket.IO)
- Database: PostgreSQL via TypeORM
- Vector/semantic support: `pgvector` (raw SQL usage in AI context paths)
- Search engine: Elasticsearch
- Caching/session/queue backend: Redis
- Job processing: Bull queues
- AI provider: Ollama HTTP API (chat + embeddings + sentiment/moderation prompts)
- Web retrieval: Google Custom Search API + HTML scraping (`cheerio`, `jsdom`/readability tooling)
- Observability: Prometheus metrics endpoint + health endpoints + request logging interceptor

## 2. Architecture

### High-level module structure
- `chat` module
  - Controllers: session/message/queue/counselor chat endpoints, file-upload endpoints
  - Services: `ChatService`, `SessionService`, `MessageService`, `CounselorQueueService`, `FileUploadService`
  - Async/event components: `ChatProcessor`, `ChatEventHandlersService`
- `ai` module
  - Controller: AI inference/sentiment/summary/moderation/embedding endpoints
  - Service: `AIService` (+ `EnhancedAIService`)
  - Async: `AIProcessor`
- `search` module
  - Controller: text/semantic/hybrid search + analytics + index management
  - Service: `SearchService`
  - Async: `SearchProcessor`, `SearchEventListener`, `MaintenanceService`
- `websocket` module
  - `WebSocketGateway`, `WebSocketService`, `ConnectionManager`
  - Guards: WS auth + WS throttling
  - Async processors: message-processing, ai-response, analytics
- `web-search` module
  - Controllers: `WebSearchController`, `WebScraperController`
  - Services: Google search adapter, scraper, scraper-AI integration
- `health` module
  - Liveness/readiness/database health checks

### Cross-service interaction
- Auth integration
  - Imports auth-service guards/decorators/strategies/modules directly from monorepo paths.
  - Registers TCP client `AUTH_SERVICE` (`host/port` configurable).
- User integration
  - Imports `user-service` entities and preferences service/module.
- Notification integration
  - Imports notification module/entities for crisis/alert-like workflows.

### Internal async/event architecture
- Event bus: `@nestjs/event-emitter`.
- Typical emitted events:
  - `session.created`, `session.ended`, `message.sent`, `message.updated`, `ai.response.generated`, `counselor.queue.*`
- Queue names:
  - `message-processing`, `summary-generation`, `ai-processing`, `chat-processing`, `search-indexing`, `ai-response`, `analytics`

### Request/response pattern
- Global prefix: `/api/v1` (except `GET /metrics`, excluded from prefix).
- Global wrappers:
  - Validation pipe (`whitelist`, `forbidNonWhitelisted`, transform)
  - Error filter returning standardized JSON error envelope
  - Response interceptor wrapping non-custom responses into `{ success, data, message, timestamp }`
- Security:
  - Global JWT + roles + throttler guards, with method-level `@Public()` overrides.

### Textual sequence diagram: user message to AI + searchable record
```text
Client -> POST /api/v1/chat/messages
  -> ChatController validates access
  -> ChatService saves user message in PostgreSQL
  -> Event: message.sent
     -> SearchEventListener queues index operation
     -> ChatEventHandlers queues moderation/sentiment jobs
  -> If senderType=user, ChatService asks AIService for reply
     -> AIService stores context + calls Ollama
     -> AI message saved to PostgreSQL
     -> Event: ai.response.generated (further indexing/analytics hooks)
Client <- message response (immediate)
```

### Textual sequence diagram: counselor matching
```text
Counselor -> POST /api/v1/chat/counselor-queue/join
  -> CounselorQueueService saves WAITING row + Redis set entry
User -> POST /api/v1/chat/counselor-chat/initiate
  -> CounselorQueueService picks random waiting counselor
  -> ChatService creates counselor-assisted session
  -> CounselorQueueService marks counselor MATCHED
  -> Event: counselor.queue.matched (WS notifications)
```

## 3. API Endpoints

Base HTTP URL prefix: `/api/v1`

## Chat REST API (`/chat`)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/chat/sessions` | POST | Public | Create chat session |
| `/chat/sessions/:sessionId` | GET | Public | Get session details |
| `/chat/sessions/:sessionId` | PATCH | Public | Convert anonymous session to authenticated |
| `/chat/messages` | POST | Public | Send message |
| `/chat/messages` | GET | Public | List/query messages |
| `/chat/messages/:messageId` | PATCH | Counselor/Admin | Update message |
| `/chat/sessions/:sessionId/end` | POST | Public | End session |
| `/chat/users/:userId/sessions` | GET | User/Counselor/Admin | List user sessions |
| `/chat/sessions/:sessionId/stats` | GET | Counselor/Admin | Session statistics |
| `/chat/search/messages` | GET | Counselor/Admin | Message search (service-level wrapper) |
| `/chat/counselor-queue/join` | POST | Counselor/Admin | Join counselor queue |
| `/chat/counselor-queue/leave` | POST | Counselor/Admin | Leave counselor queue |
| `/chat/counselor-queue/status` | GET | Counselor/Admin | Queue status for counselor |
| `/chat/counselor-queue/count` | GET | Public | Available counselor count |
| `/chat/counselor-chat/initiate` | POST | User/Admin | Start counselor-assisted session |
| `/chat/counselor-chat/:sessionId/end` | POST | Authenticated participant | End counselor-assisted session |

### Example: create session
```http
POST /api/v1/chat/sessions
Content-Type: application/json

{
  "sessionType": "anonymous"
}
```

### Example: send message
```http
POST /api/v1/chat/messages
Content-Type: application/json

{
  "sessionId": "<uuid>",
  "content": "I feel anxious today",
  "senderType": "user"
}
```

## File API (`/files`)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/files/upload/image` | POST | JWT | Upload image (<=10MB, processed to WebP) |
| `/files/images/:fileName` | GET | Public | Fetch image |
| `/files/thumbnails/:fileName` | GET | Public | Fetch thumbnail |
| `/files/:fileId` | DELETE | JWT | Delete attachment |

## AI API (`/ai`)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/ai/generate-response` | POST | Public + throttled | Generate AI response |
| `/ai/analyze-sentiment` | POST | User/Counselor/Admin | Sentiment score |
| `/ai/generate-summary` | POST | Counselor/Admin | Session summary |
| `/ai/moderate-content` | POST | Counselor/Admin | Harmful-content check |
| `/ai/semantic-search` | POST | Counselor/Admin | Semantic retrieval in session |
| `/ai/generate-embedding` | POST | Counselor/Admin | Embedding generation |
| `/ai/embedding-stats/:sessionId` | GET | Counselor/Admin | Embedding statistics |
| `/ai/health` | GET | Public | AI subsystem health |

## Search API (`/search`)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/search/messages` | GET | User/Counselor/Admin | Full-text/faceted search |
| `/search/semantic` | GET | Counselor/Admin | Vector semantic search |
| `/search/hybrid` | GET | Counselor/Admin | Weighted text+semantic search |
| `/search/suggestions` | GET | User/Counselor/Admin | Autocomplete suggestions |
| `/search/analytics` | GET | Counselor/Admin | Search/content analytics |
| `/search/performance` | GET | Admin | Search performance metrics |
| `/search/stats` | GET | Counselor/Admin | Usage stats |
| `/search/health` | GET | Public | Search health |
| `/search/reindex/:sessionId` | POST | Admin | Reindex session |
| `/search/index/message/:messageId` | POST | Counselor/Admin | Queue message indexing |
| `/search/message/:messageId` | DELETE | Admin | Delete from index |
| `/search/cleanup` | POST | Admin | Cleanup old search data |
| `/search/sessions/:sessionId/similar` | GET | Counselor/Admin | Find similar sessions (placeholder response) |
| `/search/export/:sessionId` | GET | Counselor/Admin | Export session data (json/csv) |
| `/search/user/my-sessions` | GET | User/Counselor/Admin | Search only current user sessions |

## Web search API (`/web-search`)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/web-search/search` | POST | JWT | Google-backed web search |
| `/web-search/stats` | GET | JWT | User search stats |
| `/web-search/health` | GET | JWT | External search health |

## Web scraper API (`/web-scraper`)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/web-scraper/scrape` | POST | JWT | Enhanced scrape + HTML extraction |
| `/web-scraper/scrape/legacy` | POST | JWT | Backward-compatible scrape format |
| `/web-scraper/scrape/enhanced` | POST | JWT | Build AI-ready enriched context |
| `/web-scraper/integrated-search` | POST | JWT | Web+AI integrated answer pipeline |
| `/web-scraper/stats` | GET | JWT | User scraping stats |
| `/web-scraper/health` | GET | JWT | Scraper health |

## Health/System endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/health` | GET | Public | DB-backed health check |
| `/health/ready` | GET | Public | Readiness payload |
| `/health/live` | GET | Public | Liveness payload |
| `/` | GET | Public | Basic hello route |
| `/docs` | GET | Public | Swagger UI |
| `/metrics` | GET | Public | Prometheus metrics |

## WebSocket events

- Client -> server: `joinSession`, `leaveSession`, `sendMessage`, `typing`, `markAsRead`, `requestAI`, `endCounselorSession`, `testEvent`
- Server -> client (examples): `sessionJoined`, `newMessage`, `messageStatus`, `userTyping`, `messagesRead`, `chatSessionEnded`, `counselorMatched`, `error`
- Event-bus bridges: `websocket.send.to.user`, `websocket.send.to.session`, `message.sent`, `counselor.queue.matched`, `session.summary.generated`

## Request DTO and validation highlights

- `CreateSessionDto`: `sessionType` enum (`anonymous|authenticated|counselor_assisted`), optional `userId`, `counselorId`
- `SendMessageDto`: `sessionId`, `content` (`max 4000`), `senderType`, optional attachment UUID list
- `QueryMessagesDto`: optional filters (`sessionId`, `senderId`, `senderType`, dates, pagination)
- AI DTOs enforce required session/query text and optional similarity thresholds/limits

## Response format and error handling

Typical success envelope:
```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully",
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

Typical error envelope:
```json
{
  "success": false,
  "statusCode": 403,
  "error": "ForbiddenException",
  "message": "Access denied",
  "timestamp": "2026-02-17T12:00:00.000Z",
  "path": "/api/v1/chat/sessions/...",
  "method": "GET"
}
```

Common HTTP codes used:
- `200`, `201`, `202`
- `400` validation/parameter errors
- `401` unauthorized
- `403` forbidden by role/ownership
- `404` not found
- `409` queue conflict (already joined)
- `429` throttled/rate-limited
- `500`/`503` internal or dependency-unavailable paths

## 4. Database and Storage

### Primary relational storage (PostgreSQL)

### `chat_sessions`
- PK: `id` (UUID)
- Key fields: `user_id`, `counselor_id`, `session_token` (unique), `is_anonymous`, `is_active`, `started_at`, `ended_at`, `summary`, `overall_sentiment`, intervention flags, session metrics/metadata JSON

### `chat_messages`
- PK: `id` (UUID)
- FK-like reference: `session_id` -> `chat_sessions.id` (ORM relation with cascade delete)
- Key fields: `sender_id`, `sender_type`, `content`, `content_type`, `sentiment_score`, moderation flags
- Embedding field exists but is inconsistently represented in entity (`varchar`) versus vector logic used elsewhere

### `message_attachments`
- PK: `id` (UUID)
- Relation: `message_id` -> `chat_messages.id` (cascade delete)
- Key fields: file metadata/path/type/size + image/document flags

### `chat_session_summaries`
- PK: `id` (UUID)
- Relation: `session_id` -> `chat_sessions.id`
- Fields: summary text, topics array, sentiment JSONB, recommendations array

### `counselor_queue`
- PK: `id` (UUID)
- Indexed fields: `counselor_id`, `status`
- Fields: queue status, join/match timestamps, `matched_session_id`

### `ai_context`
- PK: `id` (UUID)
- Fields: `session_id`, optional `user_id`, context JSONB, `context_type`, `relevance_score`, metadata JSONB, optional expiry
- Vector similarity operations are done with raw SQL against this table in AI workflows.

### Search storage (Elasticsearch)

Indices:
- `chat_messages`
- `search_suggestions`

`chat_messages` index highlights:
- Full-text `content` with custom analyzer + synonyms
- `dense_vector` embedding (dims 768, cosine similarity)
- Facet fields (`senderType`, `sessionId`, sentiment)

### Cache/queue/session storage (Redis)

Usage patterns:
- counselor queue set: `counselor:queue`
- web-search cache keys: `search:<query>`
- search activity logs: `search:logs:<userId>`
- session/cache/queue logical DB separation via env (`REDIS_*_DB`)

### File storage
- Local filesystem path from `UPLOAD_DIR` (default `./uploads`)
- Subfolders: `images/`, `thumbnails/`
- Returned URLs use `PUBLIC_URL`/`BASE_URL` + `/api/v1/files/...`

## 5. Configuration and Environment

Configuration sources:
- `src/config/config.module.ts`
- `src/config/env.config.ts` (class-validator schema)
- Additional typed config factories: `database.config.ts`, `redis.config.ts`, `ai.config.ts`

Env file resolution order:
- `.env.<NODE_ENV>.local`
- `.env.<NODE_ENV>`
- `.env.local`
- `.env`

### Key variable groups

### Core app
- `NODE_ENV`, `PORT_CHAT`, `FRONTEND_URL`

### Database
- `DATABASE_URL` or (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`)
- SSL/pool/migration controls (`DB_SSL_*`, `DB_POOL_MAX`, `DB_RUN_MIGRATIONS`, etc.)

### Redis and queues
- `REDIS_URL` or (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`)
- DB selection: `REDIS_DB`, `REDIS_BULL_DB`, `REDIS_SESSION_DB`, `REDIS_CACHE_DB`

### AI/Ollama
- `AI_PROVIDER`
- `OLLAMA_BASE_URL`, model names (`OLLAMA_CHAT_MODEL`, `OLLAMA_EMBEDDING_MODEL`, ...)
- generation controls (`OLLAMA_TEMPERATURE`, `OLLAMA_TOP_P`, `OLLAMA_MAX_TOKENS`)

### Search
- `ELASTICSEARCH_URL`, optional auth credentials
- search throttle and tuning parameters (`SEARCH_*`, `SEMANTIC_SEARCH_*`, etc.)

### External web search
- `GOOGLE_CUSTOM_SEARCH_API_KEY`
- `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`
- web search/scraper toggles and cache TTLs

### Email/alerts
- `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, sender settings
- `ADMIN_EMAIL`, `CRISIS_TEAM_EMAIL`

### Deployment considerations
- Service assumes Redis, PostgreSQL, Elasticsearch, and Ollama availability.
- Search and AI paths degrade with fallbacks in some methods but can still fail hard when dependencies are unavailable.
- Swagger is served from runtime app; Prometheus metrics endpoint is available.

## 6. Functional Workflows

### Session lifecycle
1. Create session (`anonymous` or authenticated).
2. Send/receive messages via REST or WebSocket.
3. Trigger moderation/sentiment/indexing tasks via event + queue.
4. End session and trigger summary/cleanup jobs.

### AI response generation
1. Store context snapshot in `ai_context`.
2. Build prompt using recent history + retrieved context.
3. Call Ollama generation endpoint.
4. Save AI message and emit events.

### Semantic/hybrid search
1. Generate embedding (Ollama).
2. Query Elasticsearch dense vectors (semantic) and/or text relevance (BM25-style).
3. Merge/rerank results for hybrid mode.
4. Return results with optional highlights/facets.

### Counselor queue and matching
1. Counselor joins queue -> DB + Redis set.
2. User initiates counselor chat -> random waiting counselor selected.
3. Session created with counselor binding; counselor marked matched.
4. Ending counselor session updates queue status to avoid stale redirection.

### Validation and transformations
- DTO validation for UUIDs, enum values, lengths, ranges.
- Date and pagination checks in query endpoints.
- Role + ownership checks for session/message access.

## 7. Performance and Scalability Notes

- Uses Redis caching and asynchronous Bull jobs to keep request paths fast.
- Elasticsearch provides scalable read/search workload separation from PostgreSQL.
- WebSocket module has dedicated throttling and queue-backed background tasks.
- File delivery includes strong cache headers (`max-age=31536000`, immutable).
- Potential bottlenecks:
  - Synchronous AI calls in some request paths
  - Expensive embedding generation for high-throughput chat
  - Tight cross-service imports increase coupling and deployment coordination complexity

## 8. Usage Examples

### Example: semantic search
```bash
curl -X GET "http://localhost:4002/api/v1/search/semantic?q=panic%20attack&sessionId=<uuid>&limit=5&threshold=0.7" \
  -H "Authorization: Bearer <token>"
```

### Example: integrated web + AI flow
```bash
curl -X POST "http://localhost:4002/api/v1/web-scraper/integrated-search" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "What are the latest AI safety updates?",
    "sessionId": "<uuid>",
    "performWebSearch": true,
    "maxSearchResults": 5
  }'
```

### Example: counselor queue join
```bash
curl -X POST "http://localhost:4002/api/v1/chat/counselor-queue/join" \
  -H "Authorization: Bearer <counselor-token>"
```

## 9. Testing and Validation

Test locations:
- Unit/service/controller specs under `src/**/*.spec.ts`
- E2E smoke test under `apps/chat-service/test/app.e2e-spec.ts`

Notable covered units:
- `chat.service`, `session.service`, `message.service`
- `search.service`
- `ai.service`
- `web-search.service`, `web-scraper.service`
- `websocket.gateway`
- processors/listeners and controller specs

Test style observed:
- Heavy use of repository/queue/service mocks
- Validation of happy-path behavior and core failure paths (not found, invalid state, access failures)

E2E coverage status:
- Minimal default endpoint smoke test (`GET /` -> `Hello World!`)

## 10. Integration Notes

### How this service connects in the broader system
- Authn/authz: relies on auth-service guards/strategies/decorators and JWT config.
- User profile/preferences: direct imports from user-service modules/entities.
- Notifications/crisis handling: uses notification-service modules/templates/entities.
- Search and analytics: internal Elasticsearch + queues + event listeners.

### Known limitations and special considerations
- Tight monorepo coupling: direct source imports from other services reduce microservice isolation.
- Health readiness payload currently reports `service: 'user-service'` (naming inconsistency in chat-service code).
- Multiple code-quality inconsistencies (duplicate guards/files, duplicate lines, some placeholder/commented admin features).
- In `redis.config.ts`, Redis host/port/password are logged via `console.error` (sensitive-data leakage risk).
- Semantic/session-similarity features include placeholder/fallback logic in some paths, not full production-grade clustering.

## 11. Summary

`chat-service` is a feature-rich communication backend combining REST, WebSocket, AI inference, search indexing, and counselor routing. It is architecturally modular and functionally broad, but currently has strong compile-time coupling to sibling services and several implementation inconsistencies that should be addressed before high-stakes production deployment.
