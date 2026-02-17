# Техническа документация на Scheduler Service (`scheduler-service`)

## 1. Преглед на услугата

## Име
- `scheduler-service`

## Предназначение и роля
- Управлява планирането на срещи/сесии между потребители и консултанти.
- Поддържа времеви слотове, meeting lifecycle и напомняния.
- Интегрира се с video-service за meeting room връзки.

## Технологичен стек
- Node.js + TypeScript
- NestJS
- PostgreSQL (TypeORM)
- Redis (където е приложимо)
- JWT-базирана защита
- Health/metrics endpoint-и

## 2. Архитектура

## Модулна структура
- Scheduling модули (контролери, услуги, entity-та)
- Counselor-specific контролер за работни графици
- Health модул
- Общи interceptor/filter/guard компоненти

## Ключови entity-та
- `scheduled_meetings`
- `counselor_time_slots`
- `meeting_reminders`
- `meeting_participants`
- `scheduling_preferences`

## Взаимодействие между услуги
- Auth/user контекст за идентичност и роли
- Video-service за meeting room интеграция
- Notification-service за напомняния

## Request/response патерн
- Глобален prefix: `/api/v1`
- Стандартизиран response envelope
- Централна обработка на грешки

## Потоци на данни
### Последователност: създаване на среща с video room
```text
Client -> Scheduler API (create meeting)
  -> validate slot + participants
  -> reserve slot in DB
  -> request room from video-service
  -> persist room/session references
  -> schedule reminders
Client <- meeting payload
```

### Последователност: изпращане на напомняне
```text
Scheduler worker -> find upcoming meetings
  -> resolve participant channels
  -> call notification-service
  -> mark reminder state
```

## 3. API endpoint-и

## Scheduling endpoint-и (`/scheduling`)
- CRUD/операции за срещи, наличности и потвърждения.

## Counselor-specific контролер (`/counselor/scheduling`)
- Управление на график и налични слотове за консултанти.

## Health/system
- `GET /health`, `GET /health/live`, `GET /health/ready`
- `GET /metrics`

## Примерна заявка
```http
POST /api/v1/scheduling/meetings
Authorization: Bearer <token>
Content-Type: application/json

{
  "counselorId": "<uuid>",
  "startAt": "2026-02-20T10:00:00.000Z",
  "durationMinutes": 50
}
```

## Типичен response envelope
```json
{
  "success": true,
  "message": "Meeting created",
  "data": {},
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

## Чести status кодове
- `200`, `201`, `204`
- `400`, `401`, `403`, `404`, `409`, `429`
- `500`, `503`

## 4. База данни и съхранение

## База данни
- PostgreSQL

## Основни таблици и важни полета
### `scheduled_meetings`
- start/end, status, counselor/user refs, video refs

### `counselor_time_slots`
- slot диапазони, availability, блокирани периоди

### `meeting_reminders`
- reminder type/time/status

### `meeting_participants`
- релации към участници и роли

### `scheduling_preferences`
- предпочитания за уведомяване и времеви настройки

## Връзки
- Среща 1:N участници
- Консултант 1:N слотове
- Среща 1:N напомняния

## Query/logic акценти
- Проверка за overlap на слотове
- Проверка за активна среща/дублиране
- Транзакционни операции при create/update

## 5. Конфигурация и среда

## Наблюдавани environment променливи
- `PORT`, `NODE_ENV`
- `DATABASE_URL` / `DB_*`
- `REDIS_URL`
- `JWT_SECRET`
- `VIDEO_SERVICE_URL`
- `NOTIFICATION_SERVICE_URL`

## Съображения при deployment
- Часови зони и UTC нормализация
- Retry/timeout при извикване на видео и нотификации
- Индексиране на заявки по `startAt`, `counselorId`, `status`

## 6. Функционално описание

## Основни процеси
- Създаване/редакция/анулиране на срещи
- Управление на counselor availability
- Потвърждение и приключване на срещи
- Изпращане на напомняния

## Алгоритми и валидация
- Валидация на слотове и конфликти
- Ролеви правила за достъп
- Guard срещу невалидни state transitions

## Бележки за производителност
- Предварително филтриране на свободни слотове
- Асинхронна обработка на reminders
- Леко payload API отговаряне

## 7. Примери за употреба

### Листинг на срещи
```http
GET /api/v1/scheduling/meetings?from=2026-02-01&to=2026-02-28
Authorization: Bearer <token>
```

### Потвърждение на среща
```http
POST /api/v1/scheduling/meetings/<meetingId>/confirm
Authorization: Bearer <token>
```

### Проверка на video-service health
```http
GET /api/v1/scheduling/video/health
Authorization: Bearer <token>
```

## 8. Тестване и валидация

## Текущи тестове
- Unit тестове за scheduling логика
- Частични integration проверки

## Наблюдаван статус на покритие
- Добро покритие на основни happy-path сценарии
- Ограничени E2E проверки за cross-service зависимости

## Валидационно поведение
- DTO и guard валидация
- Ясни HTTP грешки за конфликти и невалидни входове

## 9. Бележки за интеграция

## Как услугата се свързва със системата
- Използва auth/user контекст
- Синхронизира с video-service и notification-service

## Известни ограничения / специални съображения
- Външните услуги влияят върху крайното време за отговор
- Сложните timezone сценарии изискват внимателно тестване

## 10. Обобщение
`scheduler-service` е домейнът за управление на графици и срещи, който свързва потребители, консултанти, видео сесии и напомняния в един консистентен workflow.
