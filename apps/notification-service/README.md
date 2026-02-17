# Notification Service Technical Documentation

## 1. Service Overview

### 1.1 Service Name
- `notification-service`

### 1.2 Purpose in the Overall System
- Centralized delivery service for user communication across the platform.
- Handles transactional and operational notifications:
  - Authentication emails (verification, password reset, welcome, security alerts)
  - Appointment notifications (reminder, confirmation, cancellation)
  - Admin/system alerts and crisis alerts
  - Bulk, newsletter, promotional, and feedback-request emails
  - In-app notification records for client-side consumption
- Provides preference-aware delivery, scheduling, queue-based retries, and monitoring endpoints.

### 1.3 Technology Stack
- Language/runtime: `TypeScript`, `Node.js`
- Framework: `NestJS`
- API style: `REST` (with Swagger/OpenAPI docs)
- Database: `PostgreSQL` via `TypeORM`
- Queue/broker: `Bull` + `Redis`
- Scheduling: `@nestjs/schedule` (cron)
- Mail delivery: `@nestjs-modules/mailer` (SMTP transport)
- Templating: `Handlebars` (DB templates + compiled templates)
- Auth/roles: JWT guards + role guard imported from auth/user modules
- Observability:
  - Health checks: `@nestjs/terminus`
  - Metrics: `@willsoto/nestjs-prometheus`
  - Structured logging interceptor

## 2. Architecture

### 2.1 High-Level Component Structure

```text
notification-service
|- main.ts
|  |- global prefix /api/v1 (except /metrics)
|  |- global validation + exception filter + response/logging interceptors
|  |- Swagger (/docs in non-production)
|
|- notification-service.module.ts
|  |- Config + TypeORM + Bull + Throttler + Schedule + Prometheus
|  |- Feature modules: notifications, templates, preferences, health, mailer
|
|- notifications/
|  |- services/notification.service.ts      (core orchestration)
|  |- services/mailer.service.ts            (email channel)
|  |- services/notification.controler.ts    (user/admin notification API)
|  |- processors/notification.processor.ts  (Bull workers)
|  |- services/scheduler.service.ts         (cron tasks)
|  |- entities/*                            (notifications, batch jobs, push subs)
|  |- dtos/*                                (validation contracts)
|
|- templates/
|  |- services/template.service.ts          (DB template CRUD/render/cache)
|  |- services/template.controler.ts        (template API)
|  |- entities/notification-template.entity.ts
|
|- prefrences/
|  |- services/notification-prefrences.service.ts
|  |- services/notification-prefrences.controler.ts
|  |- entities/notification-prefrence.entity.ts
|
|- clients/
|  |- notification-service.client.ts        (facade used by controller)
|
|- health/
|  |- health.controler.ts
```

### 2.2 Internal Layer Responsibilities
- Controllers
  - Expose REST endpoints.
  - Apply guards/rate limits.
  - Delegate business logic to services.
- Services
  - Execute notification workflows, preference checks, channel routing, retries, statistics.
- Repositories (TypeORM)
  - Persist and query notifications/preferences/templates/subscriptions/batch jobs.
- Queue processor
  - Asynchronous processing of scheduled/retry/bulk jobs.
- Scheduler
  - Periodic trigger of pending-notification processing.

### 2.3 Interaction with Other Services
- Strong code-level coupling to other services in monorepo:
  - Uses auth-service entities (`User`, `UserPreferences`, etc.).
  - Uses auth/user JWT/roles guards and decorators.
- Exposes notification APIs that other services can call (e.g., appointment scheduler flows, auth flows).
- Registers a TCP microservice client named `NOTIFICATION_SERVICE` (`NOTIFICATION_HOST`, `NOTIFICATION_PORT`), though core workflows in this service are HTTP + internal services.

### 2.4 Request/Data Flow (Textual Diagrams)

#### A) Immediate notification flow
```text
Client -> REST Controller -> NotificationService.sendNotification
      -> PreferencesService.shouldSendNotification
      -> save notification(status=pending)
      -> processNotification
      -> channel handler (email/in_app/sms/push)
      -> update status(sent|failed), retry metadata
      -> wrapped response
```

#### B) Scheduled notification flow
```text
Client -> POST /notifications/schedule
      -> save notification(scheduled_for=future)
      -> Bull queue job: scheduled-notification (delay)
      -> NotificationProcessor consumes job
      -> NotificationService.processNotification
      -> final status update
```

#### C) Retry flow
```text
Delivery failure -> handleNotificationError
                 -> retry_count++
                 -> if retry_count <= max_retries:
                    enqueue retry-notification with exponential delay (2^n minutes)
                 -> else mark as failed permanently
```

## 3. API Documentation

Base path: `/api/v1` (except `/metrics`)

Response behavior:
- Success responses are globally wrapped by `ResponseInterceptor` (except `/metrics`):

```json
{
  "success": true,
  "data": { "...": "..." },
  "message": "Operation completed successfully",
  "timestamp": "2026-02-17T10:00:00.000Z"
}
```

- Error responses use global `HttpExceptionFilter`:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "message": "Validation failed",
  "timestamp": "2026-02-17T10:00:00.000Z",
  "path": "/api/v1/notifications",
  "method": "POST"
}
```

### 3.1 Notification Facade Endpoints (`NotificationServiceController`)

- `POST /notifications/auth/verification-email`
  - Body: `{ "email": "string", "token": "string" }`
- `POST /notifications/auth/password-reset-email`
  - Body: `{ "email": "string", "token": "string" }`
- `POST /notifications/auth/welcome-email`
  - Body: `{ "email": "string", "firstName": "string" }`
- `POST /notifications/appointments/reminder` (JWT)
- `POST /notifications/appointments/confirmation` (JWT)
- `POST /notifications/appointments/cancellation` (JWT)
- `POST /notifications/admin/notification` (JWT)
- `POST /notifications/crisis/alert` (JWT)
- `POST /notifications/bulk-email` (JWT)
- `GET /notifications/health/email`
- `POST /notifications/templates/:templateName/validate` (JWT)
- `POST /notifications/newsletter` (JWT)
- `POST /notifications/promotional` (JWT)
- `POST /notifications/feedback-request` (JWT)

### 3.2 Core Notification Endpoints (`NotificationController`)

All endpoints in this controller require JWT.

- `POST /notifications`
  - Sends single notification.
  - Body (`SendNotificationDto`):

```json
{
  "userId": "uuid",
  "type": "email|sms|push|in_app",
  "title": "string",
  "message": "string",
  "category": "system",
  "data": {},
  "scheduledFor": "2026-02-17T12:00:00.000Z",
  "immediate": true
}
```

- `POST /notifications/bulk`
  - Queues bulk notifications.
  - Body includes `userIds[]`, `type`, `title`, `message`, optional `data/category/scheduledFor`.

- `POST /notifications/schedule`
  - Same as send, but `scheduledFor` required (`ScheduleNotificationDto`).

- `GET /notifications/my`
  - Query (`NotificationQueryDto`): `page`, `limit`, `type`, `status`, `isRead`, `startDate`, `endDate`.

- `GET /notifications/stats`
  - Returns totals/status/type breakdown for current user.

- `PATCH /notifications/:id/read`
  - Marks one notification read.

- `PATCH /notifications/read-all`
  - Marks all current-user notifications read.

- `DELETE /notifications/:id`
  - Deletes one user notification.

- `POST /notifications/appointment/reminder`
- `POST /notifications/appointment/confirmed`
- `POST /notifications/appointment/cancelled`

- `POST /notifications/push/subscribe`
- `DELETE /notifications/push/unsubscribe/:subscriptionId`
  - Currently stubbed: returns not-supported message.

Throttling highlights:
- `POST /notifications`: 5 req/min (`short` profile override)
- `POST /notifications/bulk`: 2 req/min

### 3.3 Admin Notification Endpoints (`NotificationAdminController`)

JWT protected.

- `GET /admin/notifications/stats`
- `POST /admin/notifications/process-pending`
- `GET /admin/notifications/user/:userId`
- `GET /admin/notifications/user/:userId/stats`

### 3.4 Template Endpoints (`TemplateController`)

JWT protected at controller level.

- `GET /notification-templates`
  - Optional query: `category`
- `GET /notification-templates/:templateName`
- `POST /notification-templates` (admin role required)
- `PUT /notification-templates/:templateName` (admin role required)
- `POST /notification-templates/:templateName/test`

### 3.5 Preference Endpoints (`NotificationPreferencesController`)

JWT protected.

- `GET /notification-preferences`
- `PUT /notification-preferences`
  - Body:

```json
{
  "preferences": [
    {
      "notificationCategory": "appointments",
      "emailEnabled": true,
      "smsEnabled": false,
      "pushEnabled": true,
      "inAppEnabled": true,
      "frequency": "immediate",
      "quietHoursStart": "22:00",
      "quietHoursEnd": "07:00"
    }
  ]
}
```

### 3.6 Health Endpoints

- `GET /health`
  - Terminus DB check
- `GET /health/ready`
- `GET /health/live`
- `GET /metrics`
  - Prometheus metrics (excluded from global prefix and response wrapper)

### 3.7 Common Status Codes
- `200` OK
- `201` Created
- `400` validation/business errors
- `401` unauthorized (guarded routes)
- `404` resource/template/notification not found
- `429` throttled requests
- `500` internal/server-side failures

## 4. Database and Storage

## 4.1 Database Engine
- PostgreSQL (via `DATABASE_URL`)

### 4.2 Core Entities / Tables

#### `notifications`
- `id` UUID PK
- `user_id` FK -> auth `users.id`
- `type` enum: `email|sms|push|in_app`
- `title`, `message`
- `data` JSONB (template ids, metadata, CTA, etc.)
- `status` enum: `pending|sent|delivered|failed|cancelled`
- `scheduled_for`, `sent_at`, `read_at`, `clicked_at`
- `error_message`, `retry_count`, `max_retries`
- `created_at`, `updated_at`

#### `notification_preferences`
- Unique constraint: `(user_id, notification_category)`
- Channel toggles: `email_enabled`, `sms_enabled`, `push_enabled`, `in_app_enabled`
- Frequency/quiet hours: `frequency`, `quiet_hours_start`, `quiet_hours_end`

#### `notification_templates`
- `template_name` unique
- `template_category`
- `subject_template`, `body_template`
- `supported_channels` (simple array)
- `variables` JSONB
- `is_active`

#### `push_subscriptions`
- `endpoint`, `p256dh_key`, `auth_key`, `user_agent`
- `is_active`
- linked to user

#### `notification_batch_jobs`
- Batch metadata (`job_name`, `job_type`, `target_users[]`, `template_id`)
- Counters (`total_count`, `sent_count`, `failed_count`)
- Lifecycle timestamps/status

### 4.3 Example ORM Query Patterns

```ts
// pending notifications due now
find({
  where: {
    status: NotificationStatus.PENDING,
    scheduledFor: LessThanOrEqual(new Date())
  },
  take: 100
});
```

```ts
// paginated user notifications with filters
createQueryBuilder('notification')
  .where('notification.userId = :userId', { userId })
  .andWhere('notification.type = :type', { type })
  .orderBy('notification.createdAt', 'DESC')
  .skip((page - 1) * limit)
  .take(limit);
```

## 5. Configuration and Environment

### 5.1 Environment Variables Used

Core service:
- `PORT_NOTIFICATION`
- `NODE_ENV`
- `FRONTEND_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`

Database:
- `DATABASE_URL`

Redis/Bull:
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_DB`

Mailer/SMTP:
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_SECURE`
- `MAIL_USER`
- `MAIL_PASS`
- `MAIL_FROM_NAME`
- `MAIL_FROM_ADDRESS`

Notification content/routing:
- `PLATFORM_NAME`
- `SUPPORT_EMAIL`
- `ADMIN_EMAIL`
- `CRISIS_TEAM_EMAIL`

Internal client config:
- `NOTIFICATION_HOST`
- `NOTIFICATION_PORT`

### 5.2 Deployment Considerations
- Global prefix `/api/v1`; ensure gateway/routing matches.
- `synchronize: false` in TypeORM: DB schema must exist via migrations/manual DDL.
- Redis must be reachable for queue processing.
- SMTP credentials are required for email-producing flows.
- Swagger enabled only when `NODE_ENV != production`.
- Service binds `0.0.0.0`.

### 5.3 Secrets Management
- Secrets currently read from environment variables.
- Recommended production approach: inject via vault/secret manager and avoid committing env files.

## 6. Functional Description

### 6.1 Core Features and Workflows
- Single and bulk notification creation.
- Scheduled delivery via delayed Bull jobs.
- Preference-aware send decision before persistence/dispatch.
- Multi-channel routing by `NotificationType`.
- Retry with exponential backoff after failure.
- Appointment/auth/system/marketing helper workflows.
- Template CRUD + render + preview/test endpoint.
- User preference retrieval and update.

### 6.2 Validation Rules and Data Transformations
- Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`.
- DTO constraints include UUID, enum, booleans, arrays, optional date strings.
- Query params transformed to typed values (`page`, `limit`, `isRead`).
- HTML-to-text fallback in plain email mode strips tags.

### 6.3 Channel Behavior (Current State)
- `email`: implemented and production-relevant.
- `in_app`: stored as sent records for client polling.
- `sms`: placeholder, throws unsupported error.
- `push`: placeholder, validates subscription presence then throws unsupported error.

### 6.4 Performance Notes
- Bulk processing executes iteratively; queue helps offload API latency.
- Batch size for pending processing capped at 100 per run.
- Compiled Handlebars templates cached in-memory by template name.
- Throttling profiles prevent API abuse.

## 7. Usage Examples

### 7.1 Send Notification

```bash
curl -X POST http://localhost:4006/api/v1/notifications \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "11111111-1111-1111-1111-111111111111",
    "type": "in_app",
    "title": "Daily Check-in",
    "message": "How are you feeling today?",
    "category": "system",
    "immediate": true
  }'
```

### 7.2 Send Appointment Reminder

```bash
curl -X POST http://localhost:4006/api/v1/notifications/appointment/reminder \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "11111111-1111-1111-1111-111111111111",
    "counselorId": "22222222-2222-2222-2222-222222222222",
    "appointmentId": "33333333-3333-3333-3333-333333333333",
    "appointmentDate": "2026-02-20",
    "appointmentTime": "14:00",
    "counselorName": "Dr. Smith",
    "userName": "John",
    "userEmail": "john@example.com",
    "counselorEmail": "drsmith@example.com"
  }'
```

### 7.3 Validate Template Rendering

```bash
curl -X POST http://localhost:4006/api/v1/notifications/templates/welcome/validate \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"user_name":"John","platform_name":"Serenity Space"}'
```

## 8. Testing and Validation

### 8.1 Test Coverage Present in Service
- Minimal test file exists: `src/notification-service.controller.spec.ts`.
- Current test validates default hello-world controller behavior only.

### 8.2 Missing/Needed Tests
- NotificationService unit tests (preference checks, channel routing, retries).
- Integration tests for queue processor and cron-triggered processing.
- Controller tests for guarded endpoints and DTO validation failures.
- Template rendering tests with variable mismatch cases.
- Error-path tests for SMTP failures and fallback behaviors.

### 8.3 Edge Cases Handled in Code
- Notification blocked by user preferences returns `null` send result.
- Quiet hours spanning midnight supported.
- Missing push subscriptions logged and skipped.
- Retry capped by `maxRetries` with permanent fail state.
- Missing admin/crisis recipient emails explicitly handled (warn/error).

## 9. Integration Notes

### 9.1 How This Service Connects to the Platform
- Consumed by auth/scheduler/other services via HTTP endpoints.
- Shares user/auth entities and guards from other services within monorepo.
- Provides operational endpoints for health/metrics and admin control.

### 9.2 Known Limitations and Special Considerations
- Duplicate/overlapping controller namespaces under `/notifications` increase route-surface complexity.
- SMS and push channels are declared but not implemented.
- Some files contain copy-paste naming artifacts (`prefrences`, `controler`, and readiness payload saying `user-service`).
- Template directory in mailer module points to `dist/templates/email` for both dev/prod, which may require build pipeline alignment.
- Test suite is currently insufficient for production-grade confidence.

## 10. Dependencies Summary

Internal modules:
- Notifications, templates, preferences, health, mailer, database, client facade.

External infrastructure:
- PostgreSQL
- Redis
- SMTP provider

Key Nest dependencies:
- `@nestjs/typeorm`, `@nestjs/bull`, `@nestjs/schedule`, `@nestjs-modules/mailer`, `@nestjs/swagger`, `@nestjs/throttler`, `@nestjs/terminus`, `@willsoto/nestjs-prometheus`

## 11. Suggested Diagram for Unified Project Document

Use the following block in the final Olympiad report for this service:

```text
[API Gateway / Other Services]
            |
            v
   [notification-service REST API]
      |           |            |
      v           v            v
[TemplateService] [Preferences] [NotificationService]
      |                         |
      v                         v
 [PostgreSQL: templates]   [Bull Queue -> Processor]
                                 |
                                 v
                           [Mailer (SMTP)]
                                 |
                                 v
                         [Email Provider Delivery]

Also in parallel:
- [PostgreSQL notifications/preferences/push_subscriptions/batch_jobs]
- [Cron Scheduler -> processPendingNotifications]
- [Health/metrics endpoints for observability]
```
