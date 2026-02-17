# Техническа документация на User Service

## 1. Преглед на услугата

### Име на услугата
- `user-service`

### Предназначение и роля в системата
- Управлява потребителски профили, профили на консултанти и настройки.
- Предоставя търсене/филтриране на потребители и специалисти.
- Осигурява централен user domain за останалите backend услуги.

### Технологичен стек
- Node.js + TypeScript
- NestJS
- PostgreSQL (TypeORM)
- Redis (където е приложимо)
- JWT-базирана сигурност
- Swagger/OpenAPI + health/metrics endpoint-и

## 2. Архитектура

### Високо ниво на структурата
- Контролери за Users, Counselors, Preferences, Health
- Service слой за домейн логика
- Repository/entity слой за persistence
- Общи guard/interceptor/filter компоненти

### Вътрешни взаимодействия
- Controller -> Service -> Repository патерн
- DTO валидация и ролеви ограничения
- Стандартизиран response/error формат

### Взаимодействие с други услуги
- Auth-service за идентичност и role claims
- Chat/scheduler/notification услуги, които консумират user данни

### Потоци на данни
- Authenticated request -> Jwt guard -> service logic -> DB query -> response envelope

## 3. API endpoint-и

### 3.1 Users endpoint-и
- Профилни операции за текущ потребител
- CRUD/partial update на user данни
- Търсене и филтриране (според наличните политики)

### 3.2 Counselors endpoint-и
- Листинг, филтри, детайли и профилни метаданни за консултанти

### 3.3 Preferences endpoint-и
- Управление на потребителски предпочитания (език, известия, настройки)

### 3.4 Health и system endpoint-и
- `GET /health`, `GET /health/live`, `GET /health/ready`
- `GET /metrics`

### Формат на отговор и обработка на грешки
- Response envelope: `{ success, message, data, timestamp }`
- Централизиран exception handling

## 4. База данни и съхранение

### Използвани бази
- PostgreSQL (основна)
- Redis (при нужда от cache/ephemeral данни)

### Ключови entity-та и полета
- User profile модели
- Counselor profile модели
- Preference модели
- Допълнителни relation таблици според домейна

### Query патерни
- Филтриране + пагинация
- Търсене по ключови атрибути
- Join/relations за enriched профилни данни

## 5. Конфигурация и среда

### Източници на конфигурация
- `.env` + NestJS ConfigModule

### Security и runtime настройки
- JWT secret-и
- CORS/URL настройки
- DB/Redis connection параметри

### Съображения при deployment
- Индексиране на често търсени полета
- Ограничаване на чувствителни полета в отговорите
- Логване и мониторинг на profile update операции

## 6. Функционално описание

### Основни функционалности и процеси
- Управление на потребителски профил
- Управление на counselor профили
- Настройки на потребителя
- Търсене и филтриране

### Правила за валидация и трансформации
- DTO валидация на входа
- Нормализация на определени полета
- Role-based достъп до чувствителни операции

### Бележки за производителност
- Пагинация при list endpoint-и
- Кеширане на read-heavy заявки (където е приложимо)

## 7. Примери за употреба

### Пример: текущ профил
```http
GET /api/v1/users/me
Authorization: Bearer <token>
```

### Пример: търсене на консултанти
```http
GET /api/v1/counselors?specialty=anxiety&language=bg
Authorization: Bearer <token>
```

### Пример: обновяване на настройки
```http
PATCH /api/v1/preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "notificationsEnabled": true,
  "language": "bg"
}
```

### Примерен успешен отговор
```json
{
  "success": true,
  "message": "Операцията е успешна",
  "data": {},
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

## 8. Тестване и валидация

### Налични unit тестове
- Service и validation сценарии за основните use case-и

### Integration/E2E
- Частично покритие на endpoint-и и auth guard поведение

### Edge case-и, покрити в тестовете
- Невалидни payload-и
- Липсващи/недостъпни ресурси
- Недостатъчни роли за операция

## 9. Бележки за интеграция

### Как услугата се свързва с останалата система
- Осигурява user данни за chat/scheduler/notification домейните
- Разчита на auth claims за идентичност и права

### Известни ограничения и специални съображения
- Част от полетата/филтрите зависят от текущата домейн схема
- Някои тежки търсения може да изискват допълнителни индекси

## 10. Текстова диаграма

```text
Client -> User Service -> PostgreSQL
       <- profile/preferences data
Other Services -> User Service (lookup/profile metadata)
```

## 11. Обобщение
`user-service` е централен профилен домейн за платформата и предоставя стабилен API слой за потребители, консултанти и настройки с ясни правила за достъп.
