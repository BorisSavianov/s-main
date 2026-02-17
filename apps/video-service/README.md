# Video Service Technical Documentation

## 1. Service Overview

### 1.1 Service Name
- `video-service`

### 1.2 Purpose and Role in the System
- Provides real-time video communication capabilities for counseling/meeting sessions.
- Manages:
  - Video room lifecycle (create, join, leave, end)
  - Participant state and media state
  - WebRTC signaling relay over WebSockets
  - Meeting linkage with scheduler-service
  - Room statistics and session metadata
- Acts as a bridge between synchronous REST APIs and low-latency Socket.IO events.

### 1.3 Technology Stack
- Language/runtime: `TypeScript`, `Node.js`
- Framework: `NestJS`
- Transport:
  - REST over HTTP
  - WebSockets (`socket.io`) via `@nestjs/websockets`
- ORM/Database: `TypeORM` + `PostgreSQL`
- Scheduling/events: `@nestjs/schedule`, `@nestjs/event-emitter`
- Auth/security:
  - JWT guard for HTTP endpoints (imported from user-service)
  - Manual JWT parsing for WebSocket handshake in gateway
- Observability:
  - Swagger docs at `/api/docs`
  - Terminus health endpoints
  - Prometheus metrics via `@willsoto/nestjs-prometheus`

## 2. Architecture

### 2.1 Component Structure

```text
video-service
|- src/main.ts
|  |- app bootstrap, helmet/compression/cors
|  |- Socket.IO adapter, global validation pipe, Swagger
|
|- src/video-service.module.ts (AppModule)
|  |- Config, TypeORM(Postgres), Throttler, Prometheus
|  |- HealthModule + VideoModule + AuthCoreModule
|
|- src/video/services/video.module.ts
|  |- VideoController (REST)
|  |- VideoService (business logic)
|  |- VideoGateway (WebSocket)
|  |- SchedulingIntegrationService (HTTP client to scheduler-service)
|
|- src/video/entities/
|  |- video_rooms
|  |- video_participants
|  |- video_sessions
|
|- src/video/dtos/
|  |- create/join/update-media/recording/screen-share DTOs
```

### 2.2 Main Runtime Interactions
- REST controllers call `VideoService` for room and participant operations.
- `VideoGateway` also calls `VideoService` for join/leave/signaling/media operations.
- `VideoService` calls `SchedulingIntegrationService` for meeting access validation and status updates.
- `VideoService` emits real-time events through `VideoGateway` to connected socket clients.

### 2.3 Interaction with Other Services
- **scheduler-service** (primary integration):
  - Validate whether a user is allowed to access a meeting.
  - Update meeting with generated video room details.
  - Update meeting status (`in_progress`, `completed`, etc.).
- **auth/user services**:
  - Imports JWT guards/decorators/entities from sibling services in monorepo.
- **notification/auth entities are included in TypeORM entity list** (cross-service coupling).

### 2.4 Data Flow (Textual Sequence)

#### A) Create room for meeting
```text
Client -> POST /api/v1/video/meetings/:meetingId/room
      -> VideoService.createRoom
      -> SchedulingIntegration.validateMeetingAccess
      -> insert video_rooms row
      -> SchedulingIntegration.updateMeetingWithRoomDetails
      -> response with room metadata + access codes
```

#### B) Join room (REST or WS path)
```text
Client -> join request (REST /join or WS join-room)
      -> VideoService.joinRoom
      -> check room exists/status/capacity/access
      -> upsert participant in video_participants
      -> room status waiting -> active if first participant
      -> optional meeting status -> in_progress
      -> return room + participant + RTC config + session token
```

#### C) End room
```text
Host/Moderator -> end request
               -> VideoService.endRoom
               -> mark room ended + disconnect participants
               -> update session summary in video_sessions
               -> update meeting status completed (if linked)
               -> gateway broadcast room-ended
```

## 3. API Documentation (REST)

Base URL prefix: `/api/v1`

Authentication:
- `@UseGuards(JwtAuthGuard)` is applied at `VideoController` level.
- Several endpoints are additionally annotated with `@InternalAuth()` metadata.

Response format:
- This service does **not** register global response/exception interceptors in `main.ts`.
- Responses are primarily raw controller return objects or Nest default exception payloads.

### 3.1 Utility Endpoint
- `GET /`
  - Source: `VideoServiceController`
  - Returns: `"Hello World!"`

### 3.2 Video Room Endpoints (`/video`)

1. `POST /video/rooms`
- Purpose: Create room
- Body (`CreateRoomDto`):
```json
{
  "meetingId": "optional-string",
  "maxParticipants": 2,
  "isRecordingEnabled": false,
  "roomSettings": {
    "audioEnabled": true,
    "videoEnabled": true,
    "screenShareEnabled": true,
    "chatEnabled": true,
    "waitingRoomEnabled": false,
    "muteOnEntry": false,
    "backgroundBlurEnabled": true,
    "maxVideosVisible": 4
  },
  "metadata": {
    "topic": "Session topic"
  }
}
```
- Notes: If `meetingId` is provided, access is validated through scheduler integration.

2. `POST /video/rooms/:roomId/join`
- Purpose: Join room
- Body (`JoinRoomDto`):
```json
{
  "displayName": "John",
  "accessCode": "ABC12345",
  "deviceCapabilities": {
    "video": true,
    "audio": true,
    "screenShare": true
  },
  "avatarUrl": "https://..."
}
```
- Response includes room, participant, RTC config, and generated session token.

3. `DELETE /video/rooms/:roomId/leave`
- Purpose: Leave room
- HTTP: `204 No Content`

4. `DELETE /video/rooms/:roomId/end`
- Purpose: End room (host/moderator)
- HTTP: `204 No Content`

5. `GET /video/rooms/:roomId`
- Purpose: Get room details (access-controlled)

6. `GET /video/rooms/:roomId/stats`
- Purpose: Get room statistics
- Example payload:
```json
{
  "participantCount": 1,
  "sessionDuration": 65432,
  "bandwidth": 0,
  "connectionQuality": "good"
}
```

7. `PUT /video/rooms/:roomId/media`
- Purpose: Update participant media state
- Body (`UpdateMediaStateDto`):
```json
{
  "video": true,
  "audio": false,
  "screenShare": false
}
```
- Response:
```json
{ "message": "Media state updated successfully" }
```

8. `POST /video/rooms/:roomId/signal`
- Purpose: Forward WebRTC signaling data
- Body: untyped `any` signal object
- HTTP: `204 No Content`

9. `GET /video/rooms/:roomId/validate`
- Purpose: Validate room access and capacity
- Query: `accessCode` (optional)
- Response shape:
```json
{
  "valid": true,
  "roomStatus": "active",
  "participantCount": 1,
  "maxParticipants": 2,
  "isFull": false,
  "requiresAccessCode": false
}
```

### 3.3 Meeting Integration Endpoints

1. `GET /video/meetings/:meetingId/room`
- Finds room for a meeting and returns room details.

2. `POST /video/meetings/:meetingId/room`
- Creates room bound to specific meeting.
- Body: same as create room.

### 3.4 Health and Monitoring Endpoints
- `GET /health` - DB health check (Terminus)
- `GET /health/ready` - readiness payload
- `GET /health/live` - liveness payload
- `GET /metrics` - Prometheus metrics controller

### 3.5 Common HTTP Status Codes
- `200` success (read/update actions)
- `201` created (room creation)
- `204` no content (leave/end/signal)
- `400` business rule violation (invalid code, room full, access denied)
- `401` unauthorized (JWT guard)
- `404` room/participant not found
- `500` unexpected server/integration errors

## 4. WebSocket Interface

Namespace: `/video`

Connection/auth:
- Gateway extracts JWT from:
  - `Authorization: Bearer <token>` header
  - `handshake.auth.token`
- Validates by decoding token payload and reading `sub` as `userId`.

### 4.1 Incoming Events
- `join-room` `{ roomId, accessCode?, displayName? }`
- `leave-room` `{ roomId }`
- `webrtc-signal` `{ roomId, type, sdp?, candidate?, targetUserId? }`
- `media-state-changed` `{ video, audio, screenShare? }`
- `chat-message` `{ message, timestamp, type }`
- `start-recording` `{ roomId }`
- `end-room` `{ roomId }`
- `get-room-stats` `{ roomId }`
- `ping`

### 4.2 Outgoing Events
- `connected`, `auth-error`, `connection-error`
- `joined-room`, `join-room-error`, `left-room`, `leave-room-error`
- `participant-joined`, `participant-left`, `participants-list`
- `webrtc-signal`, `webrtc-signal-error`
- `participant-media-changed`, `media-state-error`
- `chat-message`, `chat-message-error`
- `recording-started`, `recording-error`
- `room-ended`, `end-room-error`
- `room-stats`, `room-stats-error`
- `pong`

## 5. Database and Storage

Database: PostgreSQL (`TypeORM`)

### 5.1 Core Tables/Entities

#### `video_rooms`
- PK: `id` UUID
- Unique: `room_id`
- Meeting linkage: `meeting_id` (nullable)
- Host/access: `host_user_id`, `access_code`, `moderator_code`
- Capacity/control: `max_participants`, recording flags
- JSON fields:
  - `room_settings`
  - `rtc_configuration`
  - `metadata`
- Lifecycle: `status` (`waiting|active|ended|cancelled`), `started_at`, `ended_at`
- Relations:
  - one-to-many `video_participants`
  - one-to-many `video_sessions`

#### `video_participants`
- PK: `id` UUID
- FK-like room link via `room_id` -> `video_rooms.room_id` (`onDelete: CASCADE`)
- Participant identity: `user_id`, `display_name`, `role`, `status`
- JSON fields:
  - `device_capabilities`
  - `media_state`
  - `connection_stats`
  - `metadata`
- Timestamps: `joined_at`, `updated_at`, `last_seen`, `left_at`

#### `video_sessions`
- PK: `id` UUID
- Room link: `room_id` -> `video_rooms.room_id`
- Session details: `initiator_user_id`, `type`, `ended_at`
- JSON fields:
  - `session_data` (quality, events, summary)
  - `recording_metadata`
- Timestamps: `started_at`, `updated_at`

### 5.2 Query/ORM Patterns Used

```ts
// fetch room with participants for access/capacity checks
roomRepository.findOne({ where: { roomId }, relations: ['participants'] });
```

```ts
// cleanup query for stale active rooms
roomRepository
  .createQueryBuilder('room')
  .leftJoinAndSelect('room.participants', 'participants')
  .where('room.status = :status', { status: 'active' })
  .andWhere('room.startedAt < :cutoffTime', { cutoffTime })
  .andWhere('participants.lastSeen < :cutoffTime OR participants.lastSeen IS NULL')
  .getMany();
```

## 6. Configuration and Environment

### 6.1 Key Environment Variables
- Service/bootstrap:
  - `PORT_VIDEO` (default `4004`)
  - `NODE_ENV`
  - `FRONTEND_URL`
  - `CORS_ORIGINS` (CSV for WS CORS)
- Database:
  - `DATABASE_URL`
- JWT/auth:
  - `JWT_SECRET`
  - `JWT_EXPIRES_IN`
- WebRTC/TURN:
  - `TURN_SERVER_URL`
  - `TURN_SERVER_USERNAME`
  - `TURN_SERVER_PASSWORD`
- Integration URLs:
  - `VIDEO_SERVICE_URL`
  - `SCHEDULING_SERVICE_URL`
  - `USER_SERVICE_URL`
- Internal service auth policy:
  - `ALLOWED_INTERNAL_SERVICES`

### 6.2 Deployment Considerations
- Requires PostgreSQL availability with existing schema (`synchronize: false`).
- Requires scheduler-service connectivity for meeting-linked flows.
- WebSocket namespace `/video` must be exposed through reverse proxy/load balancer.
- If using TURN in production, TURN credentials must be configured.
- CORS must include frontend domain(s) for both HTTP and WS.

### 6.3 Dependencies (Internal/External)
- Internal monorepo dependencies on auth/user/notification entities and guards.
- External runtime dependencies:
  - NestJS core/websocket/swagger modules
  - TypeORM + Postgres driver
  - Axios HTTP client (`HttpModule`)
  - Helmet/compression
  - Prometheus/Terminus

## 7. Functional Description

### 7.1 Key Workflows
- Room creation:
  - Validates host and optional meeting access.
  - Generates room id + access and moderator codes.
  - Stores default room settings and RTC config.
- Room join:
  - Validates room status, access rights, and capacity.
  - Creates or reconnects participant entry.
  - Activates room on first participant and updates meeting status.
- Room leave/end:
  - Leave marks participant disconnected.
  - End operation enforces host/moderator authorization and finalizes room/session.
- Signaling/media updates:
  - Signaling is forwarded through gateway.
  - Media state updates persisted and broadcast.

### 7.2 Validation and Business Rules
- DTO validation via global `ValidationPipe` (`transform`, `whitelist`, `forbidNonWhitelisted`).
- `CreateRoomDto` constrains participant count (2..100).
- Join access rules allow:
  - host user
  - valid room access code
  - valid moderator code
  - valid scheduler-linked meeting access
- Room capacity enforced except for moderator access.
- End-room authorization: host or moderator only.

### 7.3 Performance Considerations
- WebRTC media is peer-to-peer; backend handles signaling/control path only.
- In-memory maps in gateway track connected clients and room membership for fast routing.
- Room cleanup logic exists (`cleanupInactiveRooms`) for stale active rooms.
- Scheduler integration HTTP calls use 5-second timeout.

## 8. Usage Examples

### 8.1 Create Room (REST)

```bash
curl -X POST http://localhost:4004/api/v1/video/rooms \
  -H "Authorization: Bearer <JWT>" \
  -H "X-Service: scheduler-service" \
  -H "X-User-Id: <host-user-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "meeting-uuid",
    "maxParticipants": 2,
    "isRecordingEnabled": false
  }'
```

### 8.2 Join Room (REST)

```bash
curl -X POST http://localhost:4004/api/v1/video/rooms/room_123/join \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Counselor",
    "accessCode": "ABC12345",
    "deviceCapabilities": {"video": true, "audio": true, "screenShare": true}
  }'
```

### 8.3 Socket.IO Client Example

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:4004/video', {
  auth: { token: '<JWT>' }
});

socket.emit('join-room', {
  roomId: 'room_123',
  accessCode: 'ABC12345',
  displayName: 'Client'
});

socket.on('joined-room', (payload) => {
  console.log('Joined', payload.room.roomId);
});

socket.emit('webrtc-signal', {
  roomId: 'room_123',
  type: 'offer',
  sdp: '...'
});
```

## 9. Testing and Validation

### 9.1 Existing Tests
- `src/video/services/video.service.spec.ts`
  - Covers:
    - room creation
    - join scenarios (success/not found/ended/full/moderator override)
    - leave behavior
    - room details retrieval
    - media update
    - room stats
- `src/video-service.controller.spec.ts`
  - Basic hello-world controller test

### 9.2 Test Characteristics
- Mostly unit tests with mocked repositories/gateway/scheduler integration.
- Strong coverage for core room lifecycle logic.
- Limited coverage for:
  - WebSocket gateway event handling
  - full integration with DB and scheduler-service
  - auth guard wiring and internal-service metadata handling

### 9.3 Edge Cases Handled
- joining non-existent or ended room
- room full constraints
- moderator joining full room
- participant reconnect path
- missing participant on media update
- leave when participant not found (no-op)

## 10. Integration Notes and Known Limitations

### 10.1 Integration Notes
- Scheduler integration is critical for meeting-bound rooms and status updates.
- Service expects user identity in JWT (`sub`) and sometimes in `X-User-Id` headers for internal calls.
- WebSocket and REST endpoints share the same room/participant business state.

### 10.2 Known Limitations / Special Considerations
- There is strong cross-service code coupling (imports from auth/user/notification modules/entities).
- `ServiceAuthGuard` exists but is not visibly wired as `APP_GUARD` in this service module.
- `@InternalAuth()` metadata is imported from user-service path, not this service’s local decorator file.
- WebSocket handshake auth decodes JWT payload manually instead of using full signature validation in gateway connection path.
- Some `src/common` filters/interceptors exist but are not registered in `main.ts`.
- Health readiness payload currently reports `service: 'user-service'` (copy/paste artifact).
- Prometheus metric prefix in module is set to `user_service_` (naming artifact).

## 11. Suggested Diagram for Unified Olympiad Report

```text
[Frontend Web App]
   | REST (/api/v1/video/*)
   | WS (/video namespace)
   v
[video-service]
   |- VideoController (HTTP)
   |- VideoGateway (Socket.IO signaling/events)
   |- VideoService (room + participant orchestration)
   |- SchedulingIntegrationService (HTTP client)
   v
[PostgreSQL]
   |- video_rooms
   |- video_participants
   |- video_sessions

Cross-service links:
video-service <-> scheduler-service (meeting access/status)
video-service <-> auth/user modules (JWT guards/decorators/entities)

Operational endpoints:
- /health, /health/ready, /health/live
- /metrics
- /api/docs
```
