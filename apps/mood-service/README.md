# Mood Service (`mood-service`) - Technical Documentation

## 1. Service Overview

## Name
- `mood-service`

## Purpose and role in the system
- Provides mood tracking and emotional self-monitoring features.
- Stores daily mood entries and computes trends/correlations.
- Manages mood goals, trigger catalogs, and actionable insights.
- Generates AI-assisted insights/recommendations from user mood history.

## Technology stack
- Runtime/language: Node.js + TypeScript
- Framework: NestJS
- API: REST (JSON), Swagger/OpenAPI docs (`/docs` in non-production)
- Persistence: PostgreSQL via TypeORM
- Cache: Redis (`ioredis`) for analytics/pattern/insight cache keys
- AI integration: Ollama via HTTP (`/api/generate`)
- Security/middleware: JWT auth (Passport), Helmet, Compression, Throttler
- Health/monitoring: Terminus health checks + Prometheus metrics

## 2. Architecture

## Module/component structure
- `mood-service.module.ts` (root module)
  - Config, PostgreSQL, JWT, Throttler, Prometheus, Health
  - Feature modules:
    - `mood-entries`
    - `mood-patterns`
    - `mood-goals`
    - `mood-insights`
    - `mood-triggers`
    - `mood-ai`
- `auth.module.ts`
  - JWT strategy + `JwtAuthGuard`
- `redis.module.ts`
  - Central Redis client service
- `database.module.ts`
  - TypeORM feature registrations for domain entities

## Core domain services
- `MoodEntriesService`
  - CRUD for daily entries, statistics, streak computation, cache invalidation
- `MoodPatternsService`
  - Weekly/monthly/hourly analysis, correlations, auto-pattern generation, AI-enhanced insights
- `MoodGoalsService`
  - Goal CRUD, progress/streak evaluation based on latest entry
- `MoodInsightsService`
  - Insight CRUD, read/helpful flags, AI insight persistence
- `MoodTriggersService`
  - Trigger CRUD, top trigger ranking
- `MoodAiService`
  - LLM prompts for insights/patterns/recommendations

## Request/response and processing flow
- Global REST prefix: `/api/v1` (except `/metrics`).
- Global validation pipe enforces DTO schemas (`whitelist`, `forbidNonWhitelisted`).
- Global interceptors:
  - `LoggingInterceptor` for per-request logging
  - `ResponseInterceptor` wraps responses to a common envelope unless already wrapped
- Global exception filter returns normalized error payloads.

## Data flow pattern (textual sequence)
```text
Client -> POST /api/v1/mood-entries
  -> JwtAuthGuard validates token
  -> MoodEntriesService saves entry in PostgreSQL
  -> Redis cache keys for user stats/patterns are invalidated
  -> MoodGoalsService checks and updates relevant goal progress
Client <- standardized success response
```

```text
Client -> POST /api/v1/mood-insights/generate-ai?days=14
  -> MoodInsightsService loads recent entries
  -> MoodAiService prompts Ollama for insights/patterns/recommendations
  -> Service deduplicates and stores new insights in mood_insights
  -> Cache invalidated
Client <- generated insight count + payload
```

## Interaction with other services
- No explicit outbound microservice RPC/queue integration in this codebase.
- Uses shared JWT contract (token payload fields such as `sub`, `email`, `role`, `sessionId`) likely issued by auth-service.

## 3. API Endpoints

Base prefix: `/api/v1`

## Mood Entries (`/mood-entries`)
- `POST /mood-entries` - create mood entry
- `GET /mood-entries` - paginated search/filter
- `GET /mood-entries/stats` - aggregated stats
- `GET /mood-entries/:entryId` - get by UUID
- `GET /mood-entries/date/:date` - get by `YYYY-MM-DD`
- `PATCH /mood-entries/:entryId` - update entry
- `DELETE /mood-entries/:entryId` - delete entry

## Mood Patterns (`/mood-patterns`)
- `POST /mood-patterns/analyze` - compute combined analysis
- `POST /mood-patterns/generate` - persist generated weekly/monthly patterns
- `GET /mood-patterns` - paginated list
- `GET /mood-patterns/weekly` - weekly summary
- `GET /mood-patterns/monthly` - monthly summary
- `GET /mood-patterns/correlations` - factor correlations
- `GET /mood-patterns/:patternId` - get by UUID
- `DELETE /mood-patterns/:patternId` - delete

## Mood Goals (`/mood-goals`)
- `POST /mood-goals` - create goal
- `GET /mood-goals` - list/filter goals
- `GET /mood-goals/:goalId` - get by UUID
- `PATCH /mood-goals/:goalId` - update
- `DELETE /mood-goals/:goalId` - delete

## Mood Insights (`/mood-insights`)
- `GET /mood-insights` - list/filter insights
- `POST /mood-insights/generate-ai` - generate AI insights for recent entries
- `GET /mood-insights/:insightId` - get by UUID
- `PATCH /mood-insights/:insightId/read` - mark read
- `PATCH /mood-insights/:insightId/helpful` - set feedback flag
- `DELETE /mood-insights/:insightId` - delete

## Mood Triggers (`/mood-triggers`)
- `POST /mood-triggers` - create trigger
- `GET /mood-triggers` - list/filter triggers
- `GET /mood-triggers/top` - top active triggers by frequency
- `GET /mood-triggers/:triggerId` - get by UUID
- `PATCH /mood-triggers/:triggerId` - update
- `DELETE /mood-triggers/:triggerId` - delete

## Health/System
- `GET /health` - DB + Redis check
- `GET /health/ready` - readiness payload
- `GET /health/live` - liveness payload
- `GET /metrics` - Prometheus metrics

## Request/response examples

### Create mood entry
```http
POST /api/v1/mood-entries
Authorization: Bearer <token>
Content-Type: application/json

{
  "rating": 4,
  "moodRating": "good",
  "notes": "Productive day",
  "energyLevel": 7,
  "stressLevel": 3,
  "sleepHours": 7.5,
  "exerciseMinutes": 30,
  "triggers": ["work stress"],
  "activities": ["walking", "reading"],
  "entryDate": "2026-02-17"
}
```

### Example success envelope
```json
{
  "success": true,
  "message": "Mood entry created successfully",
  "data": {
    "id": "<uuid>",
    "userId": "<uuid>",
    "rating": 4,
    "moodRating": "good",
    "entryDate": "2026-02-17"
  },
  "timestamp": "2026-02-17T10:00:00.000Z"
}
```

### Example error envelope
```json
{
  "success": false,
  "statusCode": 404,
  "error": "NotFoundException",
  "message": "Mood entry not found",
  "timestamp": "2026-02-17T10:01:00.000Z",
  "path": "/api/v1/mood-entries/<id>",
  "method": "GET"
}
```

## Common HTTP status codes
- `200`, `201`
- `400` validation input errors
- `401` missing/invalid/expired token
- `404` resource not found
- `409` duplicate trigger name conflict
- `429` throttled requests
- `500` unexpected server/dependency failures

## 4. Database and Storage

## Database
- PostgreSQL (`DATABASE_URL`)
- ORM: TypeORM entities mapped to tables

## Key tables and fields

### `mood_entries`
- `id` (UUID PK)
- `user_id`
- `rating` (numeric)
- `mood_rating` (enum: `very_poor|poor|neutral|good|very_good`)
- Optional wellbeing/context fields:
  - `notes`, `energy_level`, `stress_level`, `sleep_hours`, `exercise_minutes`, `medication_taken`
  - `triggers[]`, `activities[]`
- `entry_date` (date)
- `created_at`, `updated_at`

### `mood_patterns`
- `id`, `user_id`
- `pattern_type` (e.g., weekly/monthly)
- `pattern_data` (JSONB)
- `average_rating`, `trend_direction`, `confidence_score`
- `start_date`, `end_date`, timestamps

### `mood_goals`
- `id`, `user_id`, `goal_type`
- `target_value`, `current_value`
- `target_date`
- streak fields: `current_streak`, `longest_streak`
- `milestones` (JSONB)
- `is_achieved`, `is_active`, `description`, timestamps

### `mood_insights`
- `id`, `user_id`
- `insight_type`, `insight_text`
- `recommendation`, `category`, `related_entity_id`
- `confidence_score`, `data_points`
- `is_read`, `is_helpful`, timestamps

### `mood_triggers`
- `id`, `user_id`, `trigger_name`
- `trigger_category`, `impact_score`, `frequency_count`, `is_active`
- timestamps

## Relationships and constraints
- No explicit TypeORM relations (`@ManyToOne`) across entities; linkage is logical via `user_id` and reference IDs.
- Ownership checks are implemented at service query level (`where: { id, userId }`).

## Redis usage
- Caching and invalidation only (not primary data store).
- Key families observed:
  - `mood:stats:<userId>:<days>`
  - `mood:patterns:<userId>:<days>`
  - `mood:goals:<userId>`
  - `mood:insights:<userId>`
  - `mood:triggers:<userId>`

## 5. Configuration and Environment

## Config files and providers
- Root config via `ConfigModule.forRoot({ envFilePath: ['.env.local', '.env'] })`
- Environment used in `main.ts`, JWT strategy/module, Redis service, AI service, DB config.

## Important environment variables
- `PORT_MOOD` (default `4003`)
- `NODE_ENV`
- `FRONTEND_URL`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `REDIS_URL` (default `redis://localhost:6379`)
- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_DEFAULT_MODEL` (default `llama3.1:8b`)

## Deployment considerations
- Requires reachable PostgreSQL + Redis + Ollama for full functionality.
- Swagger is disabled in production.
- Global API prefix is enabled (`/api/v1`), while metrics remain at `/metrics`.

## Dependencies (internal/external)
- Internal: feature modules (`entries`, `patterns`, `goals`, `insights`, `triggers`, `ai`, `auth`, `health`)
- External: `@nestjs/*`, `typeorm`, `passport-jwt`, `ioredis`, `@nestjs/axios`, `@nestjs/terminus`, `@willsoto/nestjs-prometheus`, `helmet`, `compression`

## 6. Functional Description

## Major workflows

### Daily mood logging
1. User submits entry.
2. Entry is persisted and caches invalidated.
3. Goal progress checker evaluates active goals against the latest entry.

### Pattern analytics
1. Service fetches entries within lookback period.
2. Builds weekly/monthly/hourly aggregates.
3. Computes correlations (sleep, exercise, stress, energy + triggers).
4. Produces textual insights and optionally AI-enhanced insight list.

### Goal progression
- Supports streak-based progress and milestone generation.
- Goal completion marked when streak/target criteria are met.

### AI-driven insights
- LLM prompt context includes structured mood history, notes, activities, and triggers.
- Returns three buckets: `insights`, `patterns`, `recommendations`.
- Service deduplicates by same-day existing records before insert.

## Algorithms and transformations
- Streak calculation by contiguous dates.
- Pearson correlation computation for numeric factors.
- Trigger impact approximation using average deviation from overall rating.
- Trend classification thresholds:
  - improving: `diff > 0.2`
  - declining: `diff < -0.2`
  - otherwise stable

## Performance notes
- Redis caching lowers repeated aggregate/pattern query cost.
- Cache invalidation is broad and can be expensive if key patterns are large.
- AI calls are synchronous HTTP requests in request lifecycle (long-tail latency possible).

## 7. Usage Examples

### Analyze patterns for 30 days
```bash
curl -X POST "http://localhost:4003/api/v1/mood-patterns/analyze?days=30" \
  -H "Authorization: Bearer <token>"
```

### Generate AI insights
```bash
curl -X POST "http://localhost:4003/api/v1/mood-insights/generate-ai?days=14" \
  -H "Authorization: Bearer <token>"
```

### Get top triggers
```bash
curl "http://localhost:4003/api/v1/mood-triggers/top?limit=5" \
  -H "Authorization: Bearer <token>"
```

## 8. Testing and Validation

## Test suite overview
- Unit test present:
  - `src/mood-service.controller.spec.ts`
- E2E skeleton present:
  - `test/app.e2e-spec.ts`

## Validation coverage
- DTO-level input validation across all main endpoints.
- UUID parsing for path IDs using `ParseUUIDPipe`.
- Guard-level auth validation with specific token failure messages.

## Observed test limitations
- Current tests are scaffold-level and do not cover feature modules.
- E2E imports `MoodServiceModule` symbol, while runtime module class is `AppModule`.
- Root controller/service (`Hello World`) are not wired into `AppModule` controllers/providers.

## 9. Integration Notes

## How this service fits overall
- Consumer-facing wellness service for data collection and trend intelligence.
- Depends on shared authentication ecosystem through JWT payload and secret.
- Can be consumed by frontend dashboards and recommendation widgets.

## Known limitations and special considerations
- Entity category mismatch risk:
  - `mood_insight.category` enum in entity defines only `PATTERN|CORRELATION|ACHIEVEMENT`.
  - Services insert additional categories (`AI_DEEP_DIVE`, `AI_PATTERN`, `AI_RECOMMENDATION`).
  - This can fail at persistence depending on DB schema and enum constraints.
- Cache invalidation uses wildcard-style keys in `del` calls (e.g., `mood:<userId>:*`), but Redis `DEL` does not pattern-match; stale cache risk exists unless key-explicit deletion is done elsewhere.
- No explicit relational constraints between mood entities; cross-entity consistency relies on service logic.
- Throttling is applied broadly, but route-specific limits are not customized by endpoint complexity.

## 10. Summary

The `mood-service` is a modular analytics-oriented microservice for mood journaling, goal tracking, trigger management, and AI-assisted insight generation. Its core logic is solid for trend and correlation analysis, but production hardening should prioritize enum/schema alignment for AI insight categories, cache invalidation correctness, and comprehensive feature-level tests.
