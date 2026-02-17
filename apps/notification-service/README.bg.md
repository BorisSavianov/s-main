# Техническа документация на Notification Service

## 1. Преглед на услугата

### 1.1 Име на услугата
- `notification-service`

### 1.2 Предназначение в цялостната система
- Централизирано управление и изпращане на известия.
- Поддръжка на шаблони, предпочитания на потребителя и административни операции.
- Използва се от други услуги за transactional и system notification сценарии.

### 1.3 Технологичен стек
- Node.js + TypeScript
- NestJS
- PostgreSQL (TypeORM)
- Redis (където е приложимо за cache/queue сценарии)
- Swagger/OpenAPI
- Validation/guards/interceptors от Nest екосистемата
- Health/metrics endpoint-и

## 2. Архитектура

### 2.1 Структура на компонентите (high-level)
- Контролери:
  - `NotificationServiceController` (facade API)
  - `NotificationController` (core notification операции)
  - `NotificationAdminController` (административни действия)
  - `TemplateController` (управление на шаблони)
  - `NotificationPreferencesController` (предпочитания)
- Service слой за бизнес логика
- Repository/entity слой за persist
- Helper/adapter модули за канали и рендериране

### 2.2 Отговорности по вътрешни слоеве
- Controller слой: входни DTO, auth/role защита, HTTP контракти
- Service слой: оркестрация, валидация, template rendering, dispatch
- Persistence слой: CRUD и търсене по notification/template/preference модели

### 2.3 Взаимодействие с други услуги
- Получава заявки от auth/user/chat/scheduler и други домейни
- Прилага user preference правила преди dispatch
- Може да се интегрира с email/SMS/push канали според конфигурацията

### 2.4 Поток на заявките (текстови диаграми)
```text
Producer Service -> Notification API
  -> validate payload + template
  -> resolve recipient preferences
  -> persist notification record
  -> dispatch per channel
Producer Service <- delivery status
```

## 3. API документация

### 3.1 Facade endpoint-и (`NotificationServiceController`)
- Endpoint-и за изпращане на нотификации към външни услуги.

### 3.2 Core notification endpoint-и (`NotificationController`)
- CRUD и query върху нотификации.

### 3.3 Admin endpoint-и (`NotificationAdminController`)
- Административно управление, преглед и поддръжка.

### 3.4 Template endpoint-и (`TemplateController`)
- Създаване, редакция, валидиране и преглед на шаблони.

### 3.5 Preferences endpoint-и (`NotificationPreferencesController`)
- Управление на потребителски настройки по канал/тип известие.

### 3.6 Health endpoint-и
- `GET /health`, `GET /health/ready`, `GET /health/live`
- `GET /metrics`

### 3.7 Чести status кодове
- `200`, `201`, `204`
- `400`, `401`, `403`, `404`, `409`, `429`
- `500`, `503`

## 4. База данни и съхранение

## 4.1 База данни
- PostgreSQL

### 4.2 Основни entity-та / таблици
- Notifications
- Notification Templates
- Notification Preferences
- Delivery/log модели (ако са налични)

### 4.3 Примери за ORM query патерни
- Филтриране по user/channel/status
- Пагинация и сортиране по дата
- Fetch на template + merge на variables

## 5. Конфигурация и среда

### 5.1 Използвани environment променливи
- `PORT`, `NODE_ENV`
- `DATABASE_URL` / `DB_*`
- `REDIS_URL` (ако е приложимо)
- SMTP/provider credentials
- Auth/JWT настройки при защитени endpoint-и

### 5.2 Съображения за deployment
- Надеждна доставка и retries за външни канали
- Изолиране на чувствителни credentials
- Наблюдение на failure rate и latency

### 5.3 Управление на secret-и
- Използване на `.env` само за dev
- Production: secret manager/CI encrypted variables

## 6. Функционално описание

### 6.1 Основни функционалности и процеси
- Изпращане на нотификации по различни канали
- Шаблонизация и персонализация
- User preferences и opt-in/opt-out
- Административно управление

### 6.2 Правила за валидация и трансформации
- DTO валидация за recipient/payload/template variables
- Нормализиране на channel/type стойности

### 6.3 Поведение по канали (текущо състояние)
- Каналите зависят от наличната конфигурация в средата.

### 6.4 Бележки за производителност
- Batch processing при масови известия
- Оптимизирани query-та и индекси
- Async dispatch при по-тежки сценарии

## 7. Примери за употреба

### 7.1 Изпращане на нотификация
```http
POST /api/v1/notifications/send
Content-Type: application/json
Authorization: Bearer <token>

{
  "userId": "<uuid>",
  "type": "SYSTEM_ALERT",
  "channel": "email",
  "payload": { "title": "Reminder", "message": "Съобщение" }
}
```

### 7.2 Напомняне за среща
```http
POST /api/v1/notifications/appointment-reminder
```

### 7.3 Валидация на template rendering
```http
POST /api/v1/templates/preview
```

## 8. Тестване и валидация

### 8.1 Налични тестове
- Unit тестове за service/validation логика
- Частични integration тестове за контролери

### 8.2 Липсващи/необходими тестове
- По-пълни E2E сценарии
- Натоварване и retry поведение за външни канали

### 8.3 Edge case-и, покрити в кода
- Невалидни получатели
- Липсващи template variable-и
- Изключени канали по потребителски preference

## 9. Бележки за интеграция

### 9.1 Как услугата се свързва с платформата
- Използва се като централен notification hub за backend услугите.

### 9.2 Известни ограничения и специални съображения
- Реалното поведение зависи от каналните provider-и и конфигурацията.
- Някои сценарии може да изискват допълнителна queue/retry стратегия.

## 10. Обобщение на зависимости
- PostgreSQL
- Потенциално Redis/queue инфраструктура
- Email/SMS/push provider-и
- Auth контекст за защитени операции

## 11. Препоръчана диаграма за обединен проектен документ

```text
Domain Services -> Notification Service -> Channel Providers
                    |-> Templates
                    |-> User Preferences
                    |-> Delivery Logs
```
