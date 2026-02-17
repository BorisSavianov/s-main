# Техническа документация на Mood Service (`mood-service`)

## 1. Преглед на услугата

## Име
- `mood-service`

## Роля в системата
- Предоставя проследяване на настроение и емоционално самонаблюдение.
- Съхранява дневни mood записи и изчислява тенденции/корелации.
- Управлява mood цели, каталог от тригери и приложими инсайти.
- Генерира AI-подпомогнати препоръки от историята на потребителя.

## Технологичен стек
- Runtime/език: Node.js + TypeScript
- Framework: NestJS
- API: REST (JSON), Swagger/OpenAPI (`/docs` в non-production)
- Persistence: PostgreSQL чрез TypeORM
- Cache: Redis (`ioredis`) за analytics/pattern/insight cache ключове
- AI интеграция: Ollama по HTTP (`/api/generate`)
- Сигурност/middleware: JWT (Passport), Helmet, Compression, Throttler
- Health/monitoring: Terminus + Prometheus

## 2. Архитектура

## Модулна структура
- `mood-service.module.ts` (root)
  - Config, PostgreSQL, JWT, Throttler, Prometheus, Health
  - Feature модули:
    - `mood-entries`
    - `mood-patterns`
    - `mood-goals`
    - `mood-insights`
    - `mood-triggers`
    - `mood-ai`
- `auth.module.ts`
  - JWT strategy + `JwtAuthGuard`
- `redis.module.ts`
  - Централен Redis клиент
- `database.module.ts`
  - TypeORM регистрации за домейн entity-та

## Основни домейн услуги
- `MoodEntriesService`
  - CRUD за дневни записи, статистики, streak логика, cache invalidation
- `MoodPatternsService`
  - Седмични/месечни/часови анализи, корелации, автоматично генериране на patterns, AI-enhanced insight-и
- `MoodGoalsService`
  - CRUD за цели, прогрес и streak на база последни записи
- `MoodInsightsService`
  - CRUD за insight-и, read/helpful флагове, persist на AI insight-и
- `MoodTriggersService`
  - CRUD за тригери, ranking на top тригери
- `MoodAiService`
  - LLM prompt-и за insight-и/pattern-и/recommendations

## Поток request/response
- Глобален REST prefix: `/api/v1` (без `/metrics`)
- Глобален validation pipe: `whitelist`, `forbidNonWhitelisted`
- Глобални interceptor-и:
  - `LoggingInterceptor`
  - `ResponseInterceptor` (общ envelope)
- Глобален exception filter за нормализирани грешки

## Поток на данни (текстова последователност)
```text
Client -> POST /api/v1/mood-entries
  -> JwtAuthGuard валидира token
  -> MoodEntriesService записва entry в PostgreSQL
  -> Инвалидиране на Redis cache ключове за stats/patterns
  -> MoodGoalsService обновява прогреса
Client <- стандартизиран успех
```

```text
Client -> POST /api/v1/mood-insights/generate-ai?days=14
  -> MoodInsightsService зарежда последните entries
  -> MoodAiService извиква Ollama за insights/patterns/recommendations
  -> Dedup + запис в mood_insights
  -> Cache invalidation
Client <- брой генерирани insights + payload
```

## Взаимодействие с други услуги
- Няма явна outbound RPC/queue интеграция в текущата реализация.
- Ползва споделен JWT contract (напр. `sub`, `email`, `role`, `sessionId`) вероятно издаден от auth-service.

## 3. API Endpoint-и

Base prefix: `/api/v1`

## Mood Entries (`/mood-entries`)
- `POST /mood-entries` - създаване
- `GET /mood-entries` - пагинирано търсене/филтър
- `GET /mood-entries/stats` - агрегирани статистики
- `GET /mood-entries/:entryId` - по UUID
- `GET /mood-entries/date/:date` - по `YYYY-MM-DD`
- `PATCH /mood-entries/:entryId` - обновяване
- `DELETE /mood-entries/:entryId` - изтриване

## Mood Patterns (`/mood-patterns`)
- `POST /mood-patterns/analyze`
- `POST /mood-patterns/generate`
- `GET /mood-patterns`
- `GET /mood-patterns/weekly`
- `GET /mood-patterns/monthly`
- `GET /mood-patterns/correlations`
- `GET /mood-patterns/:patternId`
- `DELETE /mood-patterns/:patternId`

## Mood Goals (`/mood-goals`)
- `POST /mood-goals`
- `GET /mood-goals`
- `GET /mood-goals/:goalId`
- `PATCH /mood-goals/:goalId`
- `DELETE /mood-goals/:goalId`

## Mood Insights (`/mood-insights`)
- `GET /mood-insights`
- `POST /mood-insights/generate-ai`
- `GET /mood-insights/:insightId`
- `PATCH /mood-insights/:insightId/read`
- `PATCH /mood-insights/:insightId/helpful`
- `DELETE /mood-insights/:insightId`

## Mood Triggers (`/mood-triggers`)
- `POST /mood-triggers`
- `GET /mood-triggers`
- `GET /mood-triggers/top`
- `GET /mood-triggers/:triggerId`
- `PATCH /mood-triggers/:triggerId`
- `DELETE /mood-triggers/:triggerId`

## Health/System
- `GET /health`
- `GET /health/ready`
- `GET /health/live`
- `GET /metrics`

## Примери request/response
### Създаване на mood entry
```http
POST /api/v1/mood-entries
Authorization: Bearer <token>
Content-Type: application/json

{
  "moodScore": 7,
  "note": "Днес се чувствам по-стабилно."
}
```

### Примерен success envelope
```json
{
  "success": true,
  "message": "Операцията е успешна",
  "data": {},
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

### Примерен error envelope
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "statusCode": 400,
    "details": []
  },
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

## Чести HTTP status кодове
- `200`, `201`, `204`
- `400`, `401`, `403`, `404`, `409`, `429`
- `500`, `503`

## 4. База данни и съхранение

## База данни
- PostgreSQL + TypeORM

## Ключови таблици и полета
### `mood_entries`
- user, дата, mood score, note, контекстни фактори

### `mood_patterns`
- период, pattern тип, confidence/score

### `mood_goals`
- цел, статус, прогрес, streak

### `mood_insights`
- insight текст, тип, read/helpful флагове

### `mood_triggers`
- trigger име/тип, честота, тежест

## Връзки и ограничения
- 1:N връзки user -> entries/goals/insights/triggers
- UUID идентификатори и валидации на входа

## Redis употреба
- cache за статистики/анализи/insight-и
- invalidation при промяна на данни

## 5. Конфигурация и среда

## Config файлове и provider-и
- NestJS ConfigModule + env-based настройки

## Важни environment променливи
- `PORT`, `NODE_ENV`
- `DATABASE_URL` / `DB_*`
- `REDIS_URL`
- `JWT_SECRET`
- `OLLAMA_BASE_URL`, AI model настройки

## Deployment съображения
- Подходящи Redis TTL стойности
- Индекси за чести заявки по user/date
- Ограничаване на AI timeout-и и retries

## Зависимости (вътрешни/външни)
- Auth/JWT contract
- PostgreSQL, Redis, Ollama

## 6. Функционално описание

## Основни процеси
### Ежедневно логване на настроение
- Вход, валидация, запис, invalidation на cache, update на goals.

### Аналитика на pattern-и
- Комбинирани периодични анализи и корелации.

### Прогрес по цели
- Изчисление на progress/streak спрямо последни записи.

### AI-driven insight-и
- Генериране и съхранение на препоръки по история.

## Алгоритми и трансформации
- Агрегации по период
- Корелационни анализи по фактори
- Dedup на AI insight-и

## Бележки за производителност
- Агресивно кеширане на тежки analytics заявки
- Инвалидация на точните ключове при write операции

## 7. Примери за употреба

### Analyze patterns за 30 дни
```http
POST /api/v1/mood-patterns/analyze?days=30
Authorization: Bearer <token>
```

### Generate AI insights
```http
POST /api/v1/mood-insights/generate-ai?days=14
Authorization: Bearer <token>
```

### Top triggers
```http
GET /api/v1/mood-triggers/top
Authorization: Bearer <token>
```

## 8. Тестване и валидация

## Преглед на test suite
- Unit тестове за service слоевете
- DTO/validation проверки

## Покритие на валидацията
- Невалидни payload-и
- Невалидни UUID и липсващи ресурси
- Auth guard сценарии

## Наблюдавани ограничения в тестовете
- Ограничен E2E обхват
- AI integration сценариите са частично покрити

## 9. Бележки за интеграция

## Как услугата се вписва в платформата
- Предоставя self-monitoring домейн за frontend modules
- Използва общ auth contract и инфраструктура

## Известни ограничения
- AI изводите зависят от качеството/наличността на модела
- Аналитиката зависи от регулярност и качество на потребителските записи

## 10. Обобщение
`mood-service` реализира стабилен домейн за mood tracking, цели, тригери и AI insight-и с ясна модулна архитектура и добри observability практики.
