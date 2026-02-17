# Auth Service (`auth-service`) Technical Documentation

## 1) Service Overview

**Service name:** `auth-service`  
**Location:** `s-main/apps/auth-service`

### Purpose and role
`auth-service` is responsible for:
- User authentication (registration, login, logout, token refresh)
- Password lifecycle (forgot/reset/change password)
- Email verification
- OAuth login (Google, Facebook)
- Session lifecycle management (DB + Redis)
- Auth-related health and observability endpoints

It is a core entry point for identity and session security in the platform.

### Technology stack
- **Language/Runtime:** TypeScript, Node.js
- **Framework:** NestJS
- **Auth libraries:** `@nestjs/passport`, `passport-jwt`, `passport-local`, `passport-google-oauth20`, `passport-facebook`
- **Database:** PostgreSQL via TypeORM
- **Cache/ephemeral state/rate limiting storage:** Redis
- **API docs:** Swagger (`/docs`)
- **Monitoring:** Prometheus metrics (`/metrics`), Terminus health checks
- **Validation:** `class-validator`, `class-transformer`
- **Security:** JWT, bcrypt password hashing, throttling

---

## 2) Architecture

### Internal component structure
- **Bootstrap & platform config**
  - `src/main.ts` (global pipes, CORS, prefix, Swagger, filters/interceptors)
  - `src/app.module.ts`
- **Auth domain**
  - `src/auth/auth.controller.ts`
  - `src/auth/auth.service.ts`
  - `src/auth/user.service.ts`
  - `src/auth/session.service.ts`
  - `src/auth/oauth.service.ts`
  - DTOs, guards, strategies, decorators
- **Persistence**
  - `src/database/database.module.ts`
  - entities in `src/database/entities/*.entity.ts`
- **Redis**
  - `src/redis/redis.module.ts`, `src/redis/redis.service.ts`
  - custom throttler storage: `src/throttler/throttler-storage-redis.service.ts`
- **Cross-cutting**
  - error filter: `src/common/filters/http-exception.filter.ts`
  - interceptors: logging + response wrapper
- **Health**
  - `src/health/health.controler.ts`

### Interaction with other services
- Uses `NotificationServiceClient` (imported from notification-service source) for:
  - verification emails
  - login alert
  - password reset email
  - password changed email
  - welcome email
  - suspicious activity alerts

### Request/response pattern
- Global prefix: `/api/v1` (except `/metrics`)
- Most endpoints return uniform envelope:
```json
{
  "success": true,
  "message": "Operation completed",
  "data": {},
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```
- Global validation pipe enforces whitelist + DTO schema
- Global exception filter returns structured errors

### Data flow (text sequence)

**Email/password login**
1. Client -> `POST /api/v1/auth/login`
2. Validate DTO -> find user in PostgreSQL
3. Verify account active + login attempts (Redis counter)
4. Verify bcrypt password
5. Create `user_sessions` row (PostgreSQL)
6. Cache session in Redis (`session:<sessionId>`)
7. Issue JWT access + refresh tokens
8. Optional login alert via notification client
9. Return token bundle + user profile

**Token refresh**
1. Client -> `POST /api/v1/auth/refresh`
2. Verify refresh JWT (`JWT_REFRESH_SECRET`)
3. Validate referenced session
4. Create new session + new tokens
5. Invalidate old session
6. Return new token bundle

---

## 3) Endpoints & API Documentation

Base URL: `/{host}:4000/api/v1` (default)

## Auth endpoints (`/auth`)

1. `POST /auth/register`
- Body: `RegisterDto` (`email`, `password`, optional profile fields, optional `role`)
- Success: `201`, returns tokens + user
- Common errors: `400`, `409`

2. `POST /auth/login`
- Body: `LoginDto` (`email`, `password`, optional `rememberMe`)
- Success: `200`, returns tokens + user
- Common errors: `401`, `403`

3. `POST /auth/logout` (JWT required)
- Uses `sessionId` from JWT payload
- Success: `200`

4. `POST /auth/logout-all` (JWT required)
- Invalidates all user sessions
- Success: `200`

5. `POST /auth/refresh`
- Body: `{ "refreshToken": "..." }`
- Success: `200`, returns new token bundle
- Common errors: `401`

6. `POST /auth/forgot-password`
- Body: `{ "email": "user@example.com" }`
- Always generic success message to avoid account enumeration
- Success: `200`

7. `POST /auth/reset-password`
- Body: `{ "token": "...", "password": "NewSecurePassword123!" }`
- Success: `200`
- Common errors: `400` (invalid/expired token)

8. `POST /auth/change-password` (JWT required)
- Body: `{ "currentPassword": "...", "newPassword": "..." }`
- Success: `200`
- Common errors: `401`

9. `POST /auth/verify-email`
- Body: `{ "token": "..." }`
- Success: `200`
- Common errors: `400`

10. `POST /auth/resend-verification` (JWT required)
- Success: `200`

11. `GET /auth/google`
- Starts Google OAuth flow

12. `GET /auth/google/callback`
- Completes OAuth and redirects to frontend with tokens as query params:
  - `.../auth/callback?accessToken=...&refreshToken=...`

13. `GET /auth/facebook`
- Starts Facebook OAuth flow

14. `GET /auth/facebook/callback`
- Same behavior as Google callback

## Other controllers

15. `GET /health`  
16. `GET /health/ready`  
17. `GET /health/live`  
18. `GET /` (legacy scaffold endpoint, returns `"Hello World!"`)  
19. `GET /metrics` (Prometheus, excluded from `/api/v1` prefix)

### Common status codes
- `200`, `201`
- `400` bad request/validation/token errors
- `401` unauthorized/authentication failure
- `403` forbidden/inactive account
- `404` not found
- `409` conflict (existing user)
- `429` rate-limit exceeded
- `500` internal server error

---

## 4) Database & Storage

### Primary database
- PostgreSQL (`TypeORM`, `synchronize: false`)

### Key tables/entities

1. `users`
- `id` (uuid, PK)
- `email` (unique)
- `password_hash` (nullable for OAuth-only users)
- `role` (`user|counselor|admin`)
- profile fields (`first_name`, `last_name`, `phone`, etc.)
- `is_active`, `is_verified`
- `last_login`, `created_at`, `updated_at`, `deleted_at`

2. `user_sessions`
- `id` (uuid, PK)
- `user_id` (FK -> users)
- `session_token` (unique)
- `expires_at`
- `ip_address`, `user_agent`
- `is_active`
- timestamps

3. `oauth_providers`
- `id` (uuid, PK)
- `user_id` (FK -> users)
- `provider` (`google` / `facebook`)
- `provider_id`
- optional provider email/tokens/expiry
- timestamps

4. `counselor_profiles`
- `id` (uuid, PK)
- `user_id` (1:1 FK -> users)
- license/professional fields (`specialties`, `qualifications`, `hourly_rate`, etc.)

5. `user_preferences`
- 1:1 with users
- notification/UI preference fields + JSONB `preferences`

### Relationships
- `users` 1:N `user_sessions`
- `users` 1:N `oauth_providers`
- `users` 1:1 `counselor_profiles`
- `users` 1:1 `user_preferences`

### Redis usage
- Session cache: `session:<sessionId>`
- Email verification tokens: `email_verification:<token>` (24h TTL)
- Password reset tokens: `password_reset:<token>` (1h TTL)
- Login attempt counters: `login_attempts:<userId>` (1h TTL)
- Throttler keys for API limits

---

## 5) Configuration & Environment

### Main environment variables
- Service/network: `PORT_AUTH`, `FRONTEND_URL`, `NODE_ENV`
- DB: `DATABASE_URL`
- Redis: `REDIS_URL` (and optional host/port variants)
- JWT: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FACEBOOK_*`
- Email: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM_*`
- Security/rate limits: `BCRYPT_ROUNDS`, `RATE_LIMIT_*`, `THROTTLE_*`

`ConfigModule` includes Joi validation for many required/optional settings.

### Deployment considerations
- Docker service name: `auth-service`
- Default container port: `4000`
- Depends on PostgreSQL + Redis + notification-service
- Healthcheck configured to `GET /api/v1/health`
- Swagger docs at `/docs`

---

## 6) Functional Description

### Core workflows
- Register user -> hash password -> create DB user -> create session -> send verification email
- Login -> verify credentials -> apply lockout policy -> session + tokens -> optional login alert
- Logout/logout-all -> invalidate DB session(s) + Redis cache
- Password reset -> token in Redis + email + forced global session invalidation after reset
- OAuth login -> find/create user -> link OAuth provider -> session + tokens -> frontend redirect

### Validation/security rules
- Password complexity enforced by DTO regex
- `ValidationPipe` strips unknown fields and rejects non-whitelisted fields
- Bcrypt hashing with 12 salt rounds
- Session-bound JWT model (`sessionId` in payload)
- Throttler guard enabled at controller level

### Performance considerations
- Redis-first session lookup reduces DB load
- TTL-based token/session invalidation
- DB fallback when Redis miss occurs, then recache

---

## 7) Usage Examples

### Register
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "user"
}
```

### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "password": "SecurePassword123!",
  "rememberMe": true
}
```

### Refresh token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<jwt>"
}
```

### Authenticated logout
```http
POST /api/v1/auth/logout
Authorization: Bearer <access_token>
```

---

## 8) Testing & Validation

### Present test coverage
- Unit tests for:
  - `AuthService`
  - `AuthController`
  - `UserService`
  - `SessionService`
  - `PasswordService`
  - OAuth/JWT/local/refresh strategies
- E2E test exists but targets scaffold module (`AuthServiceModule`) and only verifies `GET /` hello-world path.

### Tested edge cases (examples)
- Invalid credentials
- Inactive account handling
- Login-attempt lock behavior
- OAuth profile incompleteness
- Session expiry/invalidation behavior
- Password hashing failures

### Gap
- E2E does not currently validate real auth API (`/api/v1/auth/*`) integration.

---

## 9) Notes for Integration

### How other services integrate
- Trust JWT tokens signed by shared `JWT_SECRET` and include session-aware claims
- For user authentication flows, clients use `/api/v1/auth/*`
- Frontend OAuth callback must parse tokens from URL query parameters (current implementation)

### Known limitations / special considerations
1. `auth-core.module.ts` imports notification-service internals directly (tight monorepo coupling).
2. Legacy scaffold endpoint/module (`/` hello world) remains in service.
3. Readiness endpoint reports `service: 'user-service'` (likely copy/paste issue).
4. Prometheus prefix typo: `auth_serice_` (missing “v”).
5. Refresh-token strategy expects `tokenId` in payload, while auth token generation does not include `tokenId`; strategy is also not wired into active auth flow.
6. Some strategy/guard classes are defined but not used by current controller routes.

---

## 10) Suggested Text Diagram for Unified Report

```text
[Client/Frontend]
   |
   | HTTPS /api/v1/auth/*
   v
[Auth Controller + Guards + Validation]
   |
   v
[Auth Service / User Service / Session Service]
   |                    |                      |
   |                    |                      |
   v                    v                      v
[PostgreSQL]       [Redis Cache]       [Notification Service Client]
(users, sessions,   (sessions, tokens,   (email/alerts)
 oauth, profiles)    rate limits)
```