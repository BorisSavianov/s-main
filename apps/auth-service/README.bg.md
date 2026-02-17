# Техническа документация на Auth Service (`auth-service`)

## 1) Преглед на услугата

**Име на услугата:** `auth-service`  
**Локация:** `s-main/apps/auth-service`

### Предназначение и роля
`auth-service` отговаря за:
- Удостоверяване на потребители (регистрация, вход, изход, обновяване на token)
- Жизнен цикъл на паролата (забравена/нулиране/смяна)
- Верификация по имейл
- OAuth вход (Google, Facebook)
- Управление на сесии (PostgreSQL + Redis)
- Health и observability endpoint-и, свързани с автентикация

Услугата е централен вход за идентичност и сигурност на сесиите в платформата.

### Технологичен стек
- **Език/Runtime:** TypeScript, Node.js
- **Framework:** NestJS
- **Auth библиотеки:** `@nestjs/passport`, `passport-jwt`, `passport-local`, `passport-google-oauth20`, `passport-facebook`
- **База данни:** PostgreSQL чрез TypeORM
- **Cache/епhemeral състояние/rate limit storage:** Redis
- **API документация:** Swagger (`/docs`)
- **Мониторинг:** Prometheus (`/metrics`), Terminus health checks
- **Валидация:** `class-validator`, `class-transformer`
- **Сигурност:** JWT, bcrypt hashing, throttling

## 2) Архитектура

### Вътрешна структура на компонентите
- **Bootstrap и platform config**
  - `src/main.ts`
  - `src/app.module.ts`
- **Auth домейн**
  - `src/auth/auth.controller.ts`
  - `src/auth/auth.service.ts`
  - `src/auth/user.service.ts`
  - `src/auth/session.service.ts`
  - `src/auth/oauth.service.ts`
  - DTO, guard-и, strategy-та, decorator-и
- **Persistence**
  - `src/database/database.module.ts`
  - entities в `src/database/entities/*.entity.ts`
- **Redis**
  - `src/redis/redis.module.ts`, `src/redis/redis.service.ts`
  - custom throttler storage: `src/throttler/throttler-storage-redis.service.ts`
- **Cross-cutting**
  - error filter: `src/common/filters/http-exception.filter.ts`
  - interceptors: logging + response wrapper
- **Health**
  - `src/health/health.controler.ts`

### Взаимодействие с други услуги
Използва `NotificationServiceClient` (от notification-service) за:
- имейли за верификация
- известяване при вход
- имейл за reset на парола
- имейл при смяна на парола
- welcome имейл
- предупреждения при подозрителна активност

### Патерн request/response
- Глобален prefix: `/api/v1` (без `/metrics`)
- Повечето endpoint-и връщат унифициран envelope:

```json
{
  "success": true,
  "message": "Операцията е успешна",
  "data": {},
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

- Глобален validation pipe налага whitelist + DTO schema
- Глобален exception filter връща структурирани грешки

### Поток на данни (текстова последователност)

**Вход с имейл/парола**
1. Клиент -> `POST /api/v1/auth/login`
2. Валидация на DTO -> търсене на потребител в PostgreSQL
3. Проверка за активен акаунт + login attempts (Redis)
4. Проверка на bcrypt парола
5. Създаване на `user_sessions` запис
6. Кеширане в Redis (`session:<sessionId>`)
7. Издаване на JWT access + refresh token
8. По избор: login alert през notification клиента
9. Връщане на token-и + профил

**Обновяване на token**
1. Клиент -> `POST /api/v1/auth/refresh`
2. Верификация на refresh JWT (`JWT_REFRESH_SECRET`)
3. Проверка на реферираната сесия
4. Създаване на нова сесия + нови token-и
5. Инвалидация на старата сесия
6. Връщане на нов token bundle

## 3) Endpoint-и и API документация

Base URL: `/{host}:4000/api/v1`

## Auth endpoint-и (`/auth`)
1. `POST /auth/register`
- Body: `RegisterDto`
- Успех: `201`
- Чести грешки: `400`, `409`

2. `POST /auth/login`
- Body: `LoginDto`
- Успех: `200`
- Чести грешки: `401`, `403`

3. `POST /auth/logout` (JWT required)

4. `POST /auth/logout-all` (JWT required)

5. `POST /auth/refresh`
- Body: `{ "refreshToken": "..." }`

6. `POST /auth/forgot-password`
- Body: `{ "email": "user@example.com" }`

7. `POST /auth/reset-password`
- Body: `{ "token": "...", "password": "NewSecurePassword123!" }`

8. `POST /auth/change-password` (JWT required)

9. `POST /auth/verify-email`

10. `POST /auth/resend-verification`

## Други контролери
- OAuth endpoints (`/auth/google`, `/auth/facebook`)
- `GET /health`, `GET /health/live`, `GET /health/ready`
- `GET /metrics`

### Чести status кодове
- `200`, `201`
- `400`, `401`, `403`, `404`, `409`, `429`
- `500`, `503`

## 4) База данни и съхранение

### Основна база
- PostgreSQL (TypeORM)

### Основни таблици/entity-та
- `users`
- `user_sessions`
- `password_reset_tokens`
- `email_verification_tokens`
- (възможни auth-related профилни таблици според домейна)

### Връзки
- Потребител 1:N към сесии
- Потребител 1:N към token таблици

### Redis употреба
- Сесии в cache
- Login attempt counters
- Throttle storage
- Краткотрайни token/state стойности

## 5) Конфигурация и среда

### Основни environment променливи
- `PORT`, `NODE_ENV`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- `DATABASE_URL` / `DB_*`
- `REDIS_URL` / `REDIS_*`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- `CORS_ORIGIN`, `FRONTEND_URL`
- SMTP/notification настройки

### Съображения при deployment
- Ротация на JWT secret-и
- SSL/TLS между услуги
- Централизирани логове/метрики
- Ограничаване на brute-force опити

## 6) Функционално описание

### Основни процеси
- Регистрация + верификация на имейл
- Вход/изход на устройство
- Logout от всички сесии
- Forgot/reset/change password
- OAuth login

### Правила за сигурност и валидация
- Строга DTO валидация
- BCrypt hashing
- JWT с валидирана сесия
- Throttling за чувствителни endpoint-и

### Производителност
- Redis за бързи проверки на сесии/лимити
- Индексиране на auth таблици
- Кратки и ефективни token операции

## 7) Примери за употреба

### Регистрация
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

### Вход
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

### Refresh token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<jwt-refresh-token>"
}
```

### Logout (authenticated)
```http
POST /api/v1/auth/logout
Authorization: Bearer <access-token>
```

## 8) Тестване и валидация

### Налични тестове
- Unit тестове за auth service логика
- Validation и guard тестове
- Частични интеграционни сценарии

### Покрити edge case-и (примерно)
- Невалидни credentials
- Изтекъл/невалиден refresh token
- Неактивен/неверифициран акаунт
- Превишени login опити

### Gap
- По-пълни E2E сценарии за OAuth
- По-детайлни тестове за race conditions при сесии

## 9) Бележки за интеграция

### Как се интегрират останалите услуги
- Използват JWT contract-а на auth-service
- Валидират role/claims спрямо потребителския контекст
- Notification workflows се извикват при auth събития

### Известни ограничения / специални съображения
- Силна зависимост от Redis за част от runtime логиката
- OAuth изисква валидна външна конфигурация

## 10) Препоръчана текстова диаграма за обединен отчет

```text
Client -> Auth API -> PostgreSQL (users/sessions)
                  -> Redis (sessions/throttle)
                  -> Notification Service (emails/alerts)
                  <- JWT access/refresh tokens
```
