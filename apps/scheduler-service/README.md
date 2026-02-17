# Scheduler Service (`scheduler-service`) - Technical Documentation

## 1. Service Overview

## Name
- `scheduler-service`

## Purpose and role
- Manages counseling meeting scheduling lifecycle.
- Handles counselor availability/time slots, booking, confirmation, cancellation, and meeting completion.
- Integrates scheduling with video-room provisioning and notification delivery.
- Provides reminder processing (cron), meeting analytics, and user scheduling preferences.

## Technology stack
- Runtime/language: Node.js + TypeScript
- Framework: NestJS
- API style: REST + Swagger/OpenAPI
- ORM/DB: TypeORM + PostgreSQL
- Scheduling engine: `@nestjs/schedule` cron jobs
- Eventing: `@nestjs/event-emitter` (in-process events)
- Security: JWT (Passport), role guards
- Ops: Prometheus metrics, Terminus health checks
- Integrations: HTTP clients to video-service and notification-service

## 2. Architecture

## Module structure
- Root: `src/scheduler-service.module.ts`
  - Config, DB, throttling, JWT/passport, Prometheus, schedule module, health module
- Feature: `src/scheduling/services/scheduling.module.ts`
  - Controllers: `SchedulingController`
  - Services:
    - `SchedulingService` (core CRUD/business rules)
    - `EnhancedSchedulingService` (video-room aware lifecycle)
    - `AvailabilityService`
    - `ReminderService` (cron)
    - `VideoIntegrationService`
    - `NotificationIntegrationService`
    - `MeetingRoomService`, `CalendarService`
  - Event listener: `MeetingEventListener`
  - Guard provider: `MeetingAccessGuard`

## Key entities
- `scheduled_meetings`
- `counselor_time_slots`
- `meeting_reminders`
- `meeting_participants`
- `scheduling_preferences`

## Cross-service interaction
- Auth and roles imported from `user-service` source paths:
  - `JwtAuthGuard`, `RolesGuard`, `Roles`, `GetUser`, `UserRole`
- Uses `user-service` entities (`User`, `CounselorProfile`, etc.) in ORM mappings.
- Outbound HTTP calls:
  - video-service (`VIDEO_SERVICE_URL`)
  - notification-service (`NOTIFICATION_SERVICE_URL`)

## Request/response pattern
- Global prefix: `/api/v1` (excluding `/metrics`).
- Global validation pipe with transformation + whitelist.
- Global response envelope interceptor and exception filter.
- Global logging interceptor for HTTP request telemetry.

## Data flow patterns

### Sequence: create meeting with video room
```text
Client -> POST /api/v1/scheduling/meetings
  -> EnhancedSchedulingService validates slot/conflict
  -> Persist scheduled_meetings row
  -> If video/audio meeting: call video-service to create room
  -> Persist room metadata in meeting
  -> Send appointment confirmation via notification-service
  -> Emit meeting.created event
Client <- created meeting payload
```

### Sequence: reminder dispatch
```text
Cron (every minute) -> ReminderService.processPendingReminders
  -> SchedulingService.getPendingReminders
  -> For each reminder: notification-service appointment reminder endpoint
  -> mark reminder as sent
```

## 3. API Endpoints

Base prefix: `/api/v1`

## Scheduling endpoints (`/scheduling`)
- `POST /scheduling/meetings` - create meeting (enhanced flow with room support)
- `GET /scheduling/meetings` - list meetings with filtering/pagination
- `GET /scheduling/meetings/upcoming` - upcoming meetings
- `GET /scheduling/meetings/statistics` - meeting stats summary
- `GET /scheduling/meetings/:id` - meeting details (+ optional room status)
- `PUT /scheduling/meetings/:id` - update meeting
- `PUT /scheduling/meetings/:id/confirm` - confirm by participant
- `PUT /scheduling/meetings/:id/start` - start meeting
- `PUT /scheduling/meetings/:id/complete` - complete meeting
- `PUT /scheduling/meetings/:id/cancel` - cancel meeting
- `POST /scheduling/meetings/:id/ensure-room` - lazy-create room
- `PUT /scheduling/meetings/:id/video-room` - sync room details (internal)
- `GET /scheduling/meetings/:id/room-access` - validate room access code
- `POST /scheduling/time-slots` - create counselor slot
- `GET /scheduling/time-slots` - list counselor slots
- `PUT /scheduling/time-slots/:id` - update slot
- `DELETE /scheduling/time-slots/:id` - delete slot
- `GET /scheduling/preferences` - get user scheduling preferences
- `PUT /scheduling/preferences` - update preferences
- `PUT /scheduling/reminders/:id/acknowledge` - acknowledge reminder
- `GET /scheduling/availability` - generated availability slots
- `GET /scheduling/health/video-service` - upstream video-service health

## Counselor-specific controller (`/counselor/scheduling`)
Defined in code but not registered in `SchedulingModule` controllers (currently inactive unless module wiring is changed):
- `POST /counselor/scheduling/bulk-time-slots`
- `GET /counselor/scheduling/availability-report`
- `GET /counselor/scheduling/dashboard`

## Health/system
- `GET /health`
- `GET /health/ready`
- `GET /health/live`
- `GET /metrics`

## Example request
```http
POST /api/v1/scheduling/meetings
Authorization: Bearer <token>
Content-Type: application/json

{
  "counselorId": "<uuid>",
  "meetingType": "video_call",
  "scheduledStart": "2026-02-20T10:00:00Z",
  "scheduledEnd": "2026-02-20T11:00:00Z",
  "title": "Counseling Session"
}
```

## Typical response envelope
```json
{
  "success": true,
  "data": { "id": "<meeting-uuid>", "status": "scheduled" },
  "message": "Operation completed successfully",
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

## Common status codes
- `200`, `201`
- `400` invalid state/input
- `401` unauthenticated/invalid token
- `403` role/access violations
- `404` meeting/time-slot/reminder not found
- `409` scheduling conflict or unavailable slot
- `429` throttled requests
- `500` integration/runtime failures

## 4. Database and Storage

## Database
- PostgreSQL via TypeORM (`DATABASE_URL`)

## Core tables and important fields

### `scheduled_meetings`
- IDs and actors: `id`, `user_id`, `counselor_id`
- Timing: `scheduled_start`, `scheduled_end`, `actual_start`, `actual_end`, `duration_minutes`
- Status and confirmation: `status`, `confirmed_by_user`, `confirmed_by_counselor`, `confirmed_at`
- Recurrence: `is_recurring`, `recurring_pattern`, `recurring_interval`, `recurring_until`, `parent_meeting_id`
- Room/channel info: `meeting_room_id`, `meeting_room_url`, `meeting_room_password`, phone/dial-in fields
- Session/cancellation notes: `session_notes`, `session_summary`, `cancellation_reason`, `cancelled_by`, `cancelled_at`

### `counselor_time_slots`
- `counselor_id`, `slot_date`, `start_time`, `end_time`
- booking controls: `is_available`, `is_booked`, `max_bookings`, `current_bookings`, `meeting_id`
- recurrence and custom rate fields

### `meeting_reminders`
- `meeting_id`, `recipient_id`, `reminder_type`, `scheduled_time`, `minutes_before`
- delivery/audit: `is_sent`, `sent_at`, `is_acknowledged`, `acknowledged_at`

### `meeting_participants`
- participant role/invitation/attendance metadata for multi-party sessions

### `scheduling_preferences`
- per-user defaults for meeting type/duration/buffer
- reminder preferences (`reminder_times`, `preferred_reminder_types`)
- availability windows (`timezone`, `earliest_time`, `latest_time`, `available_days`)
- policy limits (advance booking, cancellation/reschedule)

## Relationships
- `scheduled_meetings` -> `User` for both client and counselor (`ManyToOne`)
- `meeting_reminders` -> `scheduled_meetings`, `User`
- `meeting_participants` -> `scheduled_meetings`, `User`
- Self relation for recurring parent/child meetings in `scheduled_meetings`

## Query/logic highlights
- Conflict detection: overlapping window check
  - `(scheduledStart < endTime AND scheduledEnd > startTime)`
- Active meeting filters exclude cancelled/no-show statuses.
- Availability generator splits counselor ranges into fixed-duration slots and removes meeting conflicts.

## 5. Configuration and Environment

## Environment variables observed
- Core:
  - `PORT_SCHEDULE` (default `4003`)
  - `NODE_ENV`
  - `CORS_ORIGINS` (comma-separated)
- Security:
  - `JWT_SECRET`
  - `JWT_EXPIRES_IN`
- Database:
  - `DATABASE_URL`
- Integrations:
  - `VIDEO_SERVICE_URL` (default `http://video-service:4004/api/v1`)
  - `NOTIFICATION_SERVICE_URL` (default `http://localhost:4006/api/v1`)
  - `FRONTEND_URL` (used for room URL composition)
  - `ALLOWED_INTERNAL_SERVICES` (for internal service auth guard)
- Additional meeting-room service options:
  - `VIDEO_CONFERENCE_BASE_URL`, `DIAL_IN_NUMBER`

## Deployment considerations
- Requires PostgreSQL connectivity.
- Full functionality requires reachable video-service and notification-service.
- Swagger is enabled only outside production.
- Metrics exposed at `/metrics`.

## 6. Functional Description

## Core features/workflows
- Meeting lifecycle: create -> confirm -> in-progress -> complete/cancel.
- Recurring meeting generation based on pattern (`daily|weekly|biweekly|monthly`).
- Counselor slot management and dynamic availability generation.
- Reminder processing via cron (`EVERY_MINUTE`).
- Video room management:
  - create on demand or during meeting creation
  - validate access
  - auto-end room on cancellation/completion
- Statistics:
  - total/completed/upcoming/cancelled
  - completion/cancellation rates

## Algorithms and validation logic
- Time-slot coverage check compares requested start/end against counselor slot window (minute precision).
- Overlap conflict check prevents double-booking counselor time.
- `canJoinMeeting` logic allows join from 15 minutes before start until scheduled end.

## Performance considerations
- Multiple external HTTP calls in booking and lifecycle paths can add latency.
- Reminder cron loops over pending reminders every minute; scaling depends on query/index quality.
- TypeORM relations are eagerly queried in several methods; pagination exists for list endpoints.

## 7. Usage Examples

### List meetings
```bash
curl "http://localhost:4003/api/v1/scheduling/meetings?page=1&limit=10" \
  -H "Authorization: Bearer <token>"
```

### Confirm meeting
```bash
curl -X PUT "http://localhost:4003/api/v1/scheduling/meetings/<meetingId>/confirm" \
  -H "Authorization: Bearer <token>"
```

### Check video-service health
```bash
curl "http://localhost:4003/api/v1/scheduling/health/video-service" \
  -H "Authorization: Bearer <token>"
```

## 8. Testing and Validation

## Current tests
- Unit test file: `src/scheduler-service.controller.spec.ts`
- E2E test file: `test/app.e2e-spec.ts`

## Observed coverage status
- Tests are scaffold-level and not focused on scheduling domain logic.
- Existing tests reference `getHello()` on `SchedulerServiceController`, but controller has no such method.
- E2E expects `GET /` -> `Hello World!`, while root controller is empty.

## Validation behavior
- DTO validation via global `ValidationPipe`.
- Additional custom pipes exist (`date-validation.pipe.ts`, custom validation pipe), but global Nest validation is primary in runtime.

## 9. Integration Notes

## How it connects to the system
- Uses shared auth/role contracts from user-service.
- Reads/writes user-related entities via shared DB entities.
- Delegates communication channels to notification-service and video-service.

## Known limitations / special considerations
- `CounselorSchedulingController` is implemented but not registered in module controllers.
- `InternalAuth` decorator metadata is present on routes, but `ServiceAuthGuard` is not bound globally or per-route in current wiring; internal-route protection may be ineffective.
- Several files contain copied header comments/paths from other services (naming inconsistency risk in maintenance).
- Health readiness payload reports `service: 'user-service'` in scheduler health controller (likely copy-paste issue).
- Root app controller is empty, but scaffold tests expect a hello endpoint.

## 10. Summary

`scheduler-service` implements a full scheduling domain with meeting lifecycle control, availability computation, recurring logic, reminder automation, and external video/notification integration. The core domain design is rich and production-oriented, but module wiring and security guard application should be tightened (internal auth guard usage, inactive counselor controller, health/test consistency) before final Olympiad submission hardening.
