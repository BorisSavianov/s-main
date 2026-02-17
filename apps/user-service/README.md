# User Service Technical Documentation

## 1. Service Overview

### Service name
`user-service`

### Purpose and role in the system
The `user-service` is responsible for profile-centric business logic in the Serenity Space platform:
- User profile retrieval and updates
- Account lifecycle operations (activate, deactivate, soft-delete)
- Session visibility and revocation for users
- Counselor profile lifecycle and counselor discovery/search
- User preferences management (including web-search preference for AI features)

It complements `auth-service` by consuming JWT identity context and managing user domain data in PostgreSQL and Redis-backed caches.

### Technology stack
- Language: TypeScript
- Framework: NestJS
- ORM: TypeORM
- Databases:
  - PostgreSQL (primary persistent store)
  - Redis (cache, session cache checks)
- Auth and security:
  - `@nestjs/passport`, `passport-jwt`
  - `JwtAuthGuard`, `RolesGuard`
  - `@nestjs/throttler`
  - `helmet`, `compression`, CORS
- Observability:
  - Swagger/OpenAPI
  - Prometheus metrics (`@willsoto/nestjs-prometheus`)
  - Terminus health checks
- Testing: Jest + Supertest

## 2. Architecture

### High-level component structure
- Bootstrap and global middleware
  - `apps/user-service/src/main.ts`
- Root module and infrastructure wiring
  - `apps/user-service/src/user-service.module.ts`
- Domain modules
  - `UsersModule` (`/users`)
  - `CounselorsModule` (`/counselors`)
  - `PreferencesModule` (`/preferences`)
- Auth module (token validation and role checks)
  - `apps/user-service/src/auth/*`
- Data access
  - `apps/user-service/src/database/*`
- Cache and health
  - `apps/user-service/src/redis/*`
  - `apps/user-service/src/health/*`
- Cross-cutting concerns
  - global exception filter
  - global response interceptor
  - global logging interceptor

### Internal interactions
1. Controller receives request and passes DTO-validated data to service.
2. Guard chain (`JwtAuthGuard`, optional `RolesGuard`) enforces access.
3. Service uses TypeORM repositories for persistent data.
4. Service checks/updates Redis cache keys for hot data and sessions.
5. Response interceptor wraps output into unified response envelope.

### Interaction with other services
- Direct runtime dependency on shared JWT contract with `auth-service` (same `JWT_SECRET` expected).
- No direct REST/gRPC client calls from `user-service` to other services in current code.
- Supports internal-service auth pattern in `JwtAuthGuard` via headers:
  - `x-service`
  - `x-user-id`
  - `ALLOWED_INTERNAL_SERVICES` allow-list

### Data flow patterns

#### Flow: Get current user profile
1. `GET /api/v1/users/profile` with bearer JWT
2. `JwtStrategy` extracts and validates token payload
3. `UsersService.getUserById` checks Redis `user:<id>` first
4. On cache miss, DB query `users` + `counselorProfile`
5. Response cached for 300s and returned

#### Flow: Counselor search
1. `GET /api/v1/counselors?search=...&specialty=...`
2. `CounselorsService.searchCounselors` builds SQL query with filters
3. Data joined with `users`, sorted by rating/reviews
4. Paginated response returned

#### Flow: Preferences update
1. `PATCH /api/v1/preferences`
2. Service loads `user_preferences` row or creates defaults
3. Saves updates in PostgreSQL
4. Writes refreshed object into Redis `preferences:<userId>`

## 3. API Endpoints

Base path: `/api/v1`  
Swagger: `/docs` (enabled outside production)  
Metrics: `/metrics` (excluded from global prefix)

### 3.1 Users endpoints

#### `GET /users/profile`
- Auth: JWT required
- Description: Get current user profile
- Response: `ApiResponseDto<UserResponseDto>`

#### `GET /users/:userId`
- Auth: JWT + role (`admin` or `counselor`)
- Params: `userId` (UUID)
- Response: `ApiResponseDto<UserResponseDto>`

#### `GET /users`
- Auth: JWT + role (`admin`)
- Query:
  - `page`, `limit`
  - `search`
  - `role`
  - `isActive`
  - `isVerified`
- Response: paginated users

#### `PATCH /users/profile`
- Auth: JWT required
- Body: `UpdateProfileDto`
- Response: updated current user profile

#### `PATCH /users/:userId`
- Auth: JWT + role (`admin`)
- Body: `UpdateProfileDto`
- Response: updated user profile

#### `DELETE /users/profile`
- Auth: JWT required
- Behavior: soft delete current account (`deletedAt`, `isActive=false`)

#### `DELETE /users/:userId`
- Auth: JWT + role (`admin`)
- Behavior: soft delete target account

#### `PATCH /users/:userId/activate`
- Auth: JWT + role (`admin`)
- Behavior: set `isActive=true`

#### `PATCH /users/:userId/deactivate`
- Auth: JWT + role (`admin`)
- Behavior: set `isActive=false`, invalidate active sessions

#### `GET /users/profile/sessions`
- Auth: JWT required
- Description: list active sessions and mark current session

#### `DELETE /users/profile/sessions/:sessionId`
- Auth: JWT required
- Description: revoke one session owned by current user

#### `GET /users/profile/check-session`
- Auth: JWT required
- Description: validate current session status
- Behavior: returns `success: false` and `{valid:false}` for expired/invalid session (instead of throwing for this case)

### 3.2 Counselors endpoints

#### `POST /counselors/profile`
- Auth: JWT + roles (`counselor`, `user`)
- Body: `CreateCounselorProfileDto`
- Extra rule: service enforces `user.role === counselor`

#### `GET /counselors/profile`
- Auth: JWT + role (`counselor`)
- Description: get own counselor profile

#### `GET /counselors/:counselorId`
- Public
- Params: `counselorId` (UUID)
- Description: get counselor profile by user/counselor ID

#### `GET /counselors`
- Public
- Query: `page`, `limit`, `search`, `specialty`, `minRating`, `maxRate`, `language`, `isAvailable`
- Description: search/filter counselors

#### `PATCH /counselors/profile`
- Auth: JWT + role (`counselor`)
- Body: `UpdateCounselorProfileDto`

#### `PATCH /counselors/:counselorId`
- Auth: JWT + role (`admin`)
- Body: `UpdateCounselorProfileDto`

#### `DELETE /counselors/profile`
- Auth: JWT + role (`counselor`)
- Description: delete own counselor profile

#### `PATCH /counselors/:counselorId/availability`
- Auth: JWT + roles (`counselor`, `admin`)
- Body: `{ "isAvailable": boolean }`

#### `GET /counselors/specialties/list`
- Public
- Description: get distinct specialties list

#### `GET /counselors/stats/overview`
- Auth: JWT + role (`admin`)
- Description: counselor statistics

### 3.3 Preferences endpoints

#### `GET /preferences`
- Auth: JWT required
- Description: get current user preferences

#### `PATCH /preferences`
- Auth: JWT required
- Body: partial preference object
- Description: update current user preferences

### 3.4 Health and system endpoints

#### `GET /health`
- Public
- Checks PostgreSQL and Redis

#### `GET /health/ready`
- Public readiness probe

#### `GET /health/live`
- Public liveness probe

#### `GET /metrics`
- Public Prometheus metrics endpoint

#### `GET /`
- Legacy scaffold endpoint (`Hello World!`)

### Response format and error handling

Successful responses use a unified shape:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {},
  "timestamp": "2026-02-17T10:00:00.000Z"
}
```

Errors are normalized by `HttpExceptionFilter`:
```json
{
  "success": false,
  "statusCode": 404,
  "error": "NotFoundException",
  "message": "User not found",
  "timestamp": "2026-02-17T10:00:00.000Z",
  "path": "/api/v1/users/...",
  "method": "GET"
}
```

Common HTTP status codes:
- `200`, `201`
- `400` validation/parsing errors
- `401` authentication/session errors
- `403` role/authorization errors
- `404` missing resources
- `409` conflict (for counselor profile/license constraints)
- `429` throttling limit exceeded

## 4. Database and Storage

### Databases used
- PostgreSQL: authoritative source for users, counselor profiles, sessions, oauth links, preferences
- Redis:
  - user cache (`user:<userId>`, TTL 300s)
  - counselor cache (`counselor:<userId>`, TTL 600s)
  - specialties cache (`counselor:specialties`, TTL 3600s)
  - preferences cache (`preferences:<userId>`, TTL 3600s)
  - session cache (`session:<sessionId>`)

### Key entities and fields

#### `users` (`apps/user-service/src/database/entities/user.entity.ts`)
- Core identity and profile fields (`email`, names, role, contact)
- State fields (`isActive`, `isVerified`, `deletedAt`, `lastLogin`)
- Relations:
  - one-to-one `counselorProfile`
  - one-to-one `preferences`
  - one-to-many `sessions`
  - one-to-many `oauthProviders`

#### `counselor_profiles`
- Professional attributes (`licenseNumber`, `specialties`, `qualifications`, `experienceYears`, `hourlyRate`)
- Visibility/quality attributes (`isAvailable`, `rating`, `totalReviews`)
- `user_id` foreign key to `users`

#### `user_sessions`
- Session token metadata (`session_token`, `expires_at`, `ip_address`, `user_agent`, `is_active`)
- `user_id` foreign key

#### `oauth_providers`
- OAuth binding (`provider`, `provider_id`, provider tokens, expiry)
- `user_id` foreign key

#### `user_preferences`
- Configurable user preferences (`web_search_enabled`, notification flags, `theme`, `language`, `timezone`, JSON `preferences`)
- Unique `user_id` (one preference row per user)

### Query patterns
- Dynamic filtering with TypeORM QueryBuilder (`searchUsers`, `searchCounselors`)
- PostgreSQL array operations for specialties/languages:
  - `:specialty = ANY(profile.specialties)`
  - `UNNEST(profile.specialties)` for aggregate analytics
- Soft-delete semantics in user account deletion:
  - update `deletedAt` + deactivate, rather than hard delete

## 5. Configuration and Environment

### Configuration sources
- `.env.local`, `.env` via global `ConfigModule`
- Main runtime keys observed in code:
  - `PORT_USER`
  - `NODE_ENV`
  - `DATABASE_URL`
  - `REDIS_URL`, optional `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
  - `JWT_SECRET`
  - `FRONTEND_URL`
  - `ALLOWED_INTERNAL_SERVICES`

### Security and runtime settings
- Global ValidationPipe with whitelist and transform enabled
- CORS with credentials enabled
- `helmet` + `compression`
- Throttler profiles:
  - short: 100 req / 1s
  - medium: 500 req / 10s
  - long: 1000 req / 60s

### Deployment considerations
- Docker build file: `Dockerfile-user`
- Docker Compose service: `user-service`
- Service depends on `postgres`, `redis`, and `auth-service`
- Health probe endpoint: `/api/v1/health`

## 6. Functional Description

### Core features and workflows
- User profile CRUD-like operations (read/update, soft-delete)
- Account state transitions (activate/deactivate)
- Session management from user perspective (list/revoke/check)
- Counselor lifecycle (create/update/delete/search/availability/stats)
- Preference retrieval and upsert

### Validation and transformation rules
- DTO validation via class-validator
- Query string booleans transformed from `'true'/'false'` into boolean types in search DTOs
- Date normalization in response mappers (`Date -> ISO strings`)

### Performance considerations
- Read-heavy endpoints use Redis cache with TTL.
- Cache invalidation occurs on profile and counselor changes.
- Some cache invalidation uses key scans (`invalidatePattern`), which may become costly at large Redis key cardinality.
- QueryBuilder pagination (`skip/take`) is used for list endpoints.

## 7. Usage Examples

### Example: get current profile
```bash
curl -X GET "http://localhost:4001/api/v1/users/profile" \
  -H "Authorization: Bearer <access_token>"
```

### Example: search counselors
```bash
curl -X GET "http://localhost:4001/api/v1/counselors?specialty=Anxiety&minRating=4&page=1&limit=10"
```

### Example: update preferences
```bash
curl -X PATCH "http://localhost:4001/api/v1/preferences" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "webSearchEnabled": true,
    "theme": "dark",
    "language": "en"
  }'
```

### Example successful response
```json
{
  "success": true,
  "data": {
    "id": "8f28234a-9b80-4c37-8128-cb93f6f6b9b6",
    "email": "user@example.com",
    "role": "user",
    "isActive": true,
    "isVerified": true
  },
  "timestamp": "2026-02-17T10:00:00.000Z"
}
```

## 8. Testing and Validation

### Unit tests present
- `users.service.spec.ts`
  - cache hit/miss behavior
  - not-found handling
  - update/delete/account activation/deactivation
  - sessions and stats methods
- `counselors.service.spec.ts`
  - role checks
  - duplicate profile/license conflict
  - cache behavior
  - update/delete/availability/stats
- `preferences.service.spec.ts`
  - cache and DB fallback
  - default preference creation
  - updates, toggles, error fallback behavior

### Integration/E2E
- `apps/user-service/test/app.e2e-spec.ts` currently validates only `GET /` returning `Hello World!`.
- No e2e coverage of `/api/v1/users`, `/api/v1/counselors`, `/api/v1/preferences` flows.

### Edge cases covered in tests
- Missing user/profile behavior (`NotFoundException`)
- Invalid role actions (`ForbiddenException`)
- Duplicate counselor profile/license conflicts (`ConflictException`)
- Redis cache read/write paths and failures for preferences checks

## 9. Integration Notes

### How this service connects to the overall system
- Consumes JWTs issued by authentication subsystem.
- Uses shared PostgreSQL schema entities with adjacent services in monorepo.
- Exposes user and counselor data for frontend and other backend services.
- Supports optional internal service trust model via guarded headers on endpoints marked for internal auth (decorator exists, but no endpoint currently uses `@InternalAuth()`).

### Known limitations and special considerations
1. **Preferences user-id mapping mismatch risk**  
   `PreferencesController` reads `user.id`, while JWT strategy primarily returns `userId`; this can break JWT-based preferences access unless payload shape contains `id`.
2. **Route ordering risk in counselors controller**  
   Dynamic route `GET /counselors/:counselorId` appears before static routes like `/counselors/specialties/list` and `/counselors/stats/overview`; depending on route matching precedence this can cause UUID parse errors for static paths.
3. **Legacy scaffold endpoint remains active**  
   `GET /` (`Hello World!`) is still present and also used by e2e tests.
4. **Docker configuration inconsistency**  
   `Dockerfile-user` exposes `4002`, while runtime code defaults to `PORT_USER=4001` and compose maps `4001:4001`.
5. **Swagger log path mismatch**  
   Startup log mentions `/api/docs` while setup path is `docs` under the app, with global prefix behavior depending on Nest settings.
6. **Internal auth decorator not yet applied**  
   Guard supports internal service header auth, but no controller endpoint is currently marked with `@InternalAuth()`.

## 10. Textual Diagram

```text
                   +----------------------+
                   |    API Clients       |
                   | (Frontend/Services)  |
                   +----------+-----------+
                              |
                              v
                    /api/v1 (NestJS)
                              |
       +----------------------+----------------------+
       |                      |                      |
       v                      v                      v
  UsersController      CounselorsController   PreferencesController
       |                      |                      |
       v                      v                      v
   UsersService         CounselorsService      PreferencesService
       |                      |                      |
       +----------+-----------+-----------+----------+
                  |                       |
                  v                       v
           PostgreSQL (TypeORM)      Redis Cache
        users, counselor_profiles,  user:*, counselor:*,
        user_sessions, preferences  preferences:*, session:*
```

## 11. Summary

`user-service` is a profile-domain microservice with clear separation of user, counselor, and preference concerns. It combines role-aware JWT authorization, PostgreSQL persistence, and Redis caching to support responsive profile operations and counselor discovery. The implementation is production-oriented in structure, with identified improvement points around route ordering, preference JWT user mapping, and e2e coverage depth.
