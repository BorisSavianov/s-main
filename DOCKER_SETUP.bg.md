# Ръководство за Docker Setup и стартиране на проекта

## 1. Преглед

### 1.1 Защо Docker се използва в този проект
Проектът е multi-service платформа (microservices + инфраструктура), която зависи от няколко runtime компонента:
- PostgreSQL + pgvector
- Redis
- AI runtime (Ollama)
- Няколко NestJS backend услуги
- Reverse proxy (Nginx)
- Monitoring/logging stack (Prometheus, Grafana, Elasticsearch, Kibana)

Docker гарантира възпроизводима среда, предвидима мрежова свързаност и консистентно стартиране.

### 1.2 Docker архитектура (високо ниво)
Проектът използва **multi-container Docker Compose**:
- Един `docker-compose.yml` в `s-main/docker-compose.yml`
- Образите се билдват от root Dockerfile-и (`Dockerfile-auth`, `Dockerfile-user` и др.)
- Споделена bridge мрежа: `serenity_space_network`
- Named volumes за персистентни данни

```text
[Client/Browser]
   |
   +--> Nginx (80/443/8080)
          |
          +--> auth-service (4000)
          +--> user-service (4001)
          +--> chat-service (4002)
          +--> scheduler-service (4003)
          +--> video-service (4004)
          +--> mood-service (4005)
          +--> notification-service (4006)

Infrastructure:
- postgres (5432)
- redis (6379)
- ollama (11434)
- prometheus (9090)
- grafana (3001)
- elasticsearch (9200)
- kibana (5601)
- adminer (8081)
- redis-commander (8082)
```

### 1.3 Предимства на тази Docker реализация
- Консистентна среда между машини
- Стартиране на всички услуги с една команда
- Изолирани зависимости и мрежа
- Вграден observability stack
- Персистентни данни чрез volumes

## 2. Изисквания

### 2.1 Софтуерни предпоставки
- Docker Engine
- Docker Compose (`docker compose`)
- Препоръчителна ОС:
  - Linux
  - macOS
  - Windows с WSL2

### 2.2 Хардуерни препоръки
- Минимум 16 GB RAM (препоръчително 32 GB)
- 4+ CPU ядра
- Силен GPU за AI задачи (NVIDIA RTX 3060+)
- Допълнително дисково пространство за:
  - Docker образи
  - PostgreSQL/Redis/Elasticsearch volumes
  - Ollama модели

### 2.3 Необходими файлове
- `s-main/docker-compose.yml`
- `s-main/.env`
- Dockerfile-и в `s-main/`:
  - `Dockerfile-auth`
  - `Dockerfile-user`
  - `Dockerfile-chat`
  - `Dockerfile-schedule`
  - `Dockerfile-video`
  - `Dockerfile-mood`
  - `Dockerfile-notification`

## 3. Структура на проекта, релевантна за Docker

```text
s-main/
|- docker-compose.yml
|- .env
|- Dockerfile-auth
|- Dockerfile-user
|- Dockerfile-chat
|- Dockerfile-schedule
|- Dockerfile-video
|- Dockerfile-mood
|- Dockerfile-notification
|- infrastructure/
|  |- postgres/
|  |- redis/
|  |- nginx/
|  |- prometheus/
|  |- grafana/
|- apps/
```

### 3.1 Dockerfile патерн (всички backend услуги)
Дву-стъпков build:
1. `node:22-alpine` builder
2. `node:22-alpine` runtime image

Чести стъпки:
- инсталация на native build зависимости (`make`, `gcc`, `g++`, `python3`)
- `npm install`
- rebuild на `bcrypt` за Alpine
- `npm run build <service-name>`
- copy на `dist/apps/<service>` + `node_modules`
- `node dist/main`

## 4. Docker Compose услуги

### 4.1 Основни инфраструктурни услуги
- `postgres` -> `5432`
- `redis` -> `6379`
- `ollama` -> `11434`

### 4.2 Приложни услуги
- `auth-service` -> `4000`
- `user-service` -> `4001`
- `chat-service` -> `4002`
- `scheduler-service` -> `4003`
- `video-service` -> `4004`
- `mood-service` -> `4005`
- `notification-service` -> `4006`

### 4.3 Gateway и Operations
- `nginx` -> `80`, `443`, `8080`
- `prometheus` -> `9090`
- `grafana` -> `3001`
- `elasticsearch` -> `9200`
- `kibana` -> `5601`
- `adminer` -> `8081`
- `redis-commander` -> `8082`

### 4.4 Volumes
- `postgres_data`
- `redis_data`
- `ollama_data`
- `prometheus_data`
- `grafana_data`
- `elasticsearch_data`

### 4.5 Мрежа
- `serenity_space_network` (bridge)
- subnet: `172.20.0.0/16`

## 5. Build и стартиране на проекта

> Изпълнявайте командите от `s-main/`.

### 5.1 Първоначален build и startup
```bash
docker compose up --build
```

### 5.2 Detached режим
```bash
docker compose up -d --build
```

### 5.3 Преглед на активни контейнери
```bash
docker compose ps
```

### 5.4 Преглед на логове
Всички услуги:
```bash
docker compose logs -f
```

Една услуга:
```bash
docker compose logs -f chat-service
```

### 5.5 Спиране и премахване на контейнери
```bash
docker compose down
```

Спиране + премахване на volumes:
```bash
docker compose down -v
```

## 6. Достъп до услугите след стартиране

### 6.1 API и service endpoint-и
- Auth API: `http://localhost:4000`
- User API: `http://localhost:4001`
- Chat API: `http://localhost:4002`
- Scheduler API: `http://localhost:4003`
- Video API: `http://localhost:4004`
- Mood API: `http://localhost:4005`
- Notification API: `http://localhost:4006`

### 6.2 Infrastructure/Ops интерфейси
- Nginx API gateway: `http://localhost:8080`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Kibana: `http://localhost:5601`
- Adminer: `http://localhost:8081`
- Redis Commander: `http://localhost:8082`

## 7. Конфигурация на средата

### 7.1 Използване на `.env`
Compose чете променливите от `s-main/.env`.

Ключови групи:
- Core runtime: `NODE_ENV`, `PLATFORM_NAME`
- JWT/auth: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`
- DB: `DATABASE_URL`, `POSTGRES_*`, `DB_*`
- Redis: `REDIS_URL`, `REDIS_*`
- AI/Ollama: `OLLAMA_*`, `AI_*`
- Web search/external APIs: `WEB_SEARCH_*`, `GOOGLE_CUSTOM_SEARCH_*`, `SEARXNG_SECRET`

### 7.2 Примерен `.env` template (безопасен)
```env
# Ports
AUTH_PORT=4000
USER_PORT=4001
CHAT_PORT=4002
SCHEDULER_PORT=4003
VIDEO_PORT=4004
MOOD_PORT=4005
NOTIFICATION_PORT=4006

# Database
POSTGRES_DB=serenity
POSTGRES_USER=serenity
POSTGRES_PASSWORD=change_me
DATABASE_URL=postgresql://serenity:change_me@postgres:5432/serenity

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=change_me
JWT_REFRESH_SECRET=change_me_too
JWT_EXPIRES_IN=15m

# Mail
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass

# AI
OLLAMA_BASE_URL=http://ollama:11434
AI_MODEL=llama3.1:8b

# Frontend/backend URL wiring
FRONTEND_URL=http://localhost:3000
API_GATEWAY_URL=http://localhost:8080
```

### 7.3 Препоръка за управление на secret-и
- Development: `.env` локално
- Production: secret manager (Vault, cloud secrets, CI encrypted variables)

## 8. Персистентност на данните

### 8.1 Персистирани данни
- PostgreSQL данни
- Redis данни
- Ollama модели
- Prometheus/Grafana/Elasticsearch данни

### 8.2 Примери за backup
```bash
docker exec -t serenity-postgres pg_dump -U serenity serenity > backup.sql
```

### 8.3 Пример за restore
```bash
cat backup.sql | docker exec -i serenity-postgres psql -U serenity serenity
```

## 9. Troubleshooting и чести проблеми

### 9.1 Конфликт на порт
```bash
# Linux/macOS
lsof -i :4000
```

### 9.2 Липсващи/невалидни environment променливи
- Проверете `s-main/.env`
- Прегледайте логовете на услугата

### 9.3 Проблеми при build
- Почистете стари image/слоеве
- Проверете наличните ресурси (RAM/disk)

### 9.4 Healthcheck неуспехи
- Уверете се, че зависимите услуги са стартирали
- Проверете readiness endpoint-ите

### 9.5 Команди за инспекция на контейнери
```bash
docker compose ps
docker compose logs -f <service-name>
docker inspect <container-name>
```

## 10. Тестване и валидация

### 10.1 Проверка, че всички контейнери работят
```bash
docker compose ps
```

### 10.2 Бързи health проверки
```bash
curl http://localhost:4000/health
curl http://localhost:4001/health
curl http://localhost:4002/health
```

### 10.3 Infra проверки
- PostgreSQL достъп
- Redis ping
- Ollama model наличност

### 10.4 Валидация на Compose зависимости
- Проверете `depends_on` и startup order логиката

## 11. Бележки за deployment (Production vs Development)

### 11.1 Local development
- По-бърз feedback цикъл, debug и локални volumes

### 11.2 Production съображения
- Reverse proxy TLS
- Horizontal scaling
- Централизиран logging/monitoring

### 11.3 Security бележки
- Не комитвайте реални secret-и
- Ограничете достъпа до ops панели
- Използвайте силни пароли и network policies

## 12. Известни caveat-и на Compose ниво в текущата конфигурация
- Част от услугите са чувствителни към startup последователността.
- AI контейнерът може да изисква допълнително време за model warm-up.

## 13. Кратко резюме за старт

# 1) Проверете `.env` стойностите
# 2) Build и старт
```bash
docker compose up --build
```
# 3) Проверете статуса
```bash
docker compose ps
```
# 4) Проследете логовете при нужда
```bash
docker compose logs -f
```
