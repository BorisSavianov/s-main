# Техническа документация на Video Service

## 1. Преглед на услугата

### 1.1 Име на услугата
- `video-service`

### 1.2 Предназначение и роля
- Осигурява видео стаи, signaling и сесийна координация за срещи.
- Поддържа интеграция със scheduler-service за планирани консултации.
- Използва WebSocket за realtime комуникация между участници.

### 1.3 Технологичен стек
- Node.js + TypeScript
- NestJS
- REST + WebSocket (Socket.IO)
- PostgreSQL (TypeORM)
- Redis (където е приложимо)
- JWT auth guard-и
- Health/monitoring endpoint-и

## 2. Архитектура

### 2.1 Структура на компонентите
- REST контролери за управление на стаи/сесии
- WebSocket gateway за signaling събития
- Service слой за room lifecycle и правила за достъп
- Entity/repository слой за persistence

### 2.2 Основни runtime взаимодействия
- Създаване/влизане/излизане от стая
- Обновяване на participant state
- Signaling обмен между peer клиенти

### 2.3 Взаимодействие с други услуги
- Scheduler-service за meeting-to-room свързване
- Auth/user контекст за роля и идентичност

### 2.4 Поток на данни (текстова последователност)
```text
Client -> POST /api/v1/video/rooms
  -> validate auth + permissions
  -> create room in DB
Client <- room payload (roomId, metadata)

Clients <-> WebSocket gateway
  -> exchange signaling events (offer/answer/ice)
  -> update participant state
```

## 3. API документация (REST)

### 3.1 Utility endpoint
- Базови system/info endpoint-и за диагностика.

### 3.2 Video room endpoint-и (`/video`)
- Създаване на стая
- Влизане в стая
- Напускане/затваряне на стая
- Детайли за активна стая

### 3.3 Meeting integration endpoint-и
- Endpoint-и за връзка между meeting ID и video room context.

### 3.4 Health и monitoring endpoint-и
- `GET /health`, `GET /health/live`, `GET /health/ready`
- `GET /metrics`

### 3.5 Чести HTTP status кодове
- `200`, `201`, `204`
- `400`, `401`, `403`, `404`, `409`, `429`
- `500`, `503`

## 4. WebSocket интерфейс

### 4.1 Входящи събития
- `join-room`
- `leave-room`
- `signal-offer`
- `signal-answer`
- `signal-ice-candidate`
- Допълнителни control/mute/video-state събития (ако са налични)

### 4.2 Изходящи събития
- Потвърждение за присъединяване
- Broadcast към други участници за signaling payload
- Събития за промяна на participant state
- Room ended/disconnected известия

## 5. База данни и съхранение

### 5.1 Основни таблици/entity-та
- Video room entity
- Room participant entity
- Meeting-room mapping entity
- Session/event log модели (ако са налични)

### 5.2 Query/ORM патерни
- Търсене на активни стаи по meeting/user
- Проверка за права за достъп
- Обновяване на participant присъствие и статус

## 6. Конфигурация и среда

### 6.1 Ключови environment променливи
- `PORT`, `NODE_ENV`
- `DATABASE_URL` / `DB_*`
- `REDIS_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- WebSocket transport настройки

### 6.2 Deployment съображения
- Sticky sessions или подходящ WS routing
- Ниски timeout стойности за бърза детекция на disconnect
- Наблюдение на connection count и signaling latency

### 6.3 Зависимости (вътрешни/външни)
- Auth/user/scheduler интеграция
- Database + Redis инфраструктура

## 7. Функционално описание

### 7.1 Ключови процеси
- Създаване на стая и свързване към среща
- Join/leave lifecycle за участници
- Realtime signaling за WebRTC peer връзки

### 7.2 Валидация и бизнес правила
- Роля и membership проверки
- Ограничения за дублирано присъединяване
- Затваряне на room при неактивност или meeting end

### 7.3 Бележки за производителност
- Лек signaling payload
- Ограничаване на ненужни broadcast-и
- Отделяне на control и media signaling потоци

## 8. Примери за употреба

### 8.1 Създаване на стая (REST)
```http
POST /api/v1/video/rooms
Authorization: Bearer <token>
Content-Type: application/json

{
  "meetingId": "<uuid>"
}
```

### 8.2 Присъединяване към стая (REST)
```http
POST /api/v1/video/rooms/<roomId>/join
Authorization: Bearer <token>
```

### 8.3 Socket.IO клиент пример
```javascript
const socket = io('http://localhost:4004', { auth: { token } });
socket.emit('join-room', { roomId });
socket.emit('signal-offer', { roomId, offer, toUserId });
```

## 9. Тестване и валидация

### 9.1 Съществуващи тестове
- Unit тестове за service логика
- Частични integration тестове за REST endpoint-и

### 9.2 Характеристики на тестовете
- Покриват базов room lifecycle и auth проверки

### 9.3 Покрити edge case-и
- Невалиден room ID
- Неразрешен достъп
- Повторно join/leave сценарии

## 10. Бележки за интеграция и известни ограничения

### 10.1 Бележки за интеграция
- Най-често се извиква от scheduler-driven user flow.
- Изисква коректен auth token и meeting mapping.

### 10.2 Известни ограничения / специални съображения
- Качеството на media зависи от клиентската WebRTC среда.
- NAT/Firewall сценарии изискват допълнителен TURN/STUN setup.

## 11. Препоръчана диаграма за обединен отчет

```text
Scheduler Service -> Video Service (create room)
Frontend Clients <-> Video WebSocket Gateway (signaling)
Video Service -> DB (room/participants state)
```
