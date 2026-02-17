# Docker Setup and Project Startup Guide

## 1. Overview

### 1.1 Why Docker is Used in This Project
This project is a multi-service platform (microservices + infrastructure) that depends on several runtime components:
- PostgreSQL + pgvector
- Redis
- AI runtime (Ollama)
- Multiple NestJS backend services
- Reverse proxy (Nginx)
- Monitoring/logging stack (Prometheus, Grafana, Elasticsearch, Kibana)

Docker ensures all components run in a reproducible environment with predictable networking and startup behavior.

### 1.2 High-Level Docker Architecture
The project uses a **multi-container Docker Compose** setup:
- One `docker-compose.yml` at `s-main/docker-compose.yml`
- Service images built from root-level Dockerfiles (`Dockerfile-auth`, `Dockerfile-user`, etc.)
- Shared bridge network: `serenity_space_network`
- Named volumes for persistent data

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

### 1.3 Benefits of This Docker Implementation
- Environment consistency across team machines
- One-command startup for all services
- Isolated networking and dependency management
- Built-in observability stack (Prometheus/Grafana/ELK)
- Persistent DB/cache/model data via volumes

---

## 2. Requirements

### 2.1 Software Prerequisites
- Docker Engine
- Docker Compose (`docker compose` command)
- Recommended OS:
  - Linux
  - macOS
  - Windows with WSL2 backend

### 2.2 Hardware Recommendations
- Minimum 16 GB RAM (32 GB recommended)
- 4+ CPU cores recommended
- Strong GPU for AI tasks (NVIDIA RTX 3060 or better)
- Extra disk space for:
  - Docker images
  - PostgreSQL/Redis/Elasticsearch volumes
  - Ollama models

### 2.3 Required Files
- `s-main/docker-compose.yml`
- `s-main/.env`
- Dockerfiles in `s-main/`:
  - `Dockerfile-auth`
  - `Dockerfile-user`
  - `Dockerfile-chat`
  - `Dockerfile-schedule`
  - `Dockerfile-video`
  - `Dockerfile-mood`
  - `Dockerfile-notification`

---

## 3. Project Structure Relevant to Docker

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
|  |- postgres/    (init scripts + SQL migrations)
|  |- redis/       (redis.conf)
|  |- nginx/       (gateway and frontend config)
|  |- prometheus/  (prometheus.yml)
|  |- grafana/     (datasources/dashboards provisioning)
|- apps/           (service source code)
```

### 3.1 Dockerfile Pattern (All Backend Services)
Each backend Dockerfile uses a two-stage build:
1. `node:22-alpine` builder
2. `node:22-alpine` runtime image

Common steps:
- install native build dependencies (`make`, `gcc`, `g++`, `python3`)
- `npm install`
- rebuild `bcrypt` for Alpine
- `npm run build <service-name>`
- copy `dist/apps/<service>` and `node_modules` to runtime image
- run `node dist/main`

---

## 4. Docker Compose Services

### 4.1 Core Infrastructure Services
- `postgres` -> `5432`
- `redis` -> `6379`
- `ollama` -> `11434`

### 4.2 Application Services
- `auth-service` -> `4000`
- `user-service` -> `4001`
- `chat-service` -> `4002`
- `scheduler-service` -> `4003`
- `video-service` -> `4004`
- `mood-service` -> `4005`
- `notification-service` -> `4006`

### 4.3 Gateway and Operations
- `nginx` -> `80`, `443`, `8080`
- `prometheus` -> `9090`
- `grafana` -> `3001`
- `elasticsearch` -> `9200`
- `kibana` -> `5601`
- `adminer` -> `8081`
- `redis-commander` -> `8082`

### 4.4 Volumes
Declared named volumes:
- `postgres_data`
- `redis_data`
- `ollama_data`
- `prometheus_data`
- `grafana_data`
- `elasticsearch_data`

### 4.5 Network
- `serenity_space_network` (bridge)
- custom subnet `172.20.0.0/16`

---

## 5. Building and Running the Project

> Run all commands from `s-main/`.

### 5.1 Initial Build and Startup
```bash
docker compose up --build
```

### 5.2 Detached Mode
```bash
docker compose up -d --build
```

### 5.3 View Running Containers
```bash
docker compose ps
```

### 5.4 View Logs
All services:
```bash
docker compose logs -f
```

Single service:
```bash
docker compose logs -f chat-service
```

### 5.5 Stop and Remove Containers
```bash
docker compose down
```

Stop and remove containers + volumes:
```bash
docker compose down -v
```

---

## 6. Accessing Services After Startup

### 6.1 API and Service Endpoints
- Auth API: `http://localhost:4000`
- User API: `http://localhost:4001`
- Chat API: `http://localhost:4002`
- Scheduler API: `http://localhost:4003`
- Video API: `http://localhost:4004`
- Mood API: `http://localhost:4005`
- Notification API: `http://localhost:4006`

### 6.2 Infrastructure and Ops UIs
- Nginx API gateway: `http://localhost:8080`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Kibana: `http://localhost:5601`
- Adminer: `http://localhost:8081`
- Redis Commander: `http://localhost:8082`

---

## 7. Environment Configuration

### 7.1 `.env` Usage
Compose reads variables from `s-main/.env`.
Important groups:
- Core runtime: `NODE_ENV`, `PLATFORM_NAME`
- JWT/auth: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`
- DB: `DATABASE_URL`, `POSTGRES_*`, `DB_*`
- Redis: `REDIS_URL`, `REDIS_*`
- AI/Ollama: `OLLAMA_*`, `AI_*`
- Web search/external APIs: `WEB_SEARCH_*`, `GOOGLE_CUSTOM_SEARCH_*`, `SEARXNG_SECRET`
- Mail: `MAIL_*`, `ADMIN_EMAIL`, `CRISIS_TEAM_EMAIL`
- Service ports/URLs: `PORT_*`, `AUTH_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `FRONTEND_URL`

### 7.2 Example `.env` Template (Safe)
```env
NODE_ENV=development
PLATFORM_NAME=Serenity Space

# Ports
PORT_AUTH=4000
PORT_USER=4001
PORT_CHAT=4002
PORT_SCHEDULE=4003
PORT_VIDEO=4004
PORT_MOOD=4005
PORT_NOTIFICATION=4006

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change_me
POSTGRES_DB=mentalhealth
DATABASE_URL=postgresql://postgres:change_me@postgres:5432/mentalhealth

# Redis
REDIS_PASSWORD=change_me
REDIS_URL=redis://:change_me@redis:6379
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0

# JWT
JWT_SECRET=change_me
JWT_REFRESH_SECRET=change_me
JWT_EXPIRES_IN=24h

# Mail
MAIL_HOST=smtp.example.com
MAIL_PORT=465
MAIL_SECURE=true
MAIL_USER=mailer@example.com
MAIL_PASS=app_password
MAIL_FROM_NAME=SerenitySpace
MAIL_FROM_ADDRESS=noreply@example.com

# AI
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_DEFAULT_MODEL=llama3.1:8b

# Frontend/backend URL wiring
FRONTEND_URL=http://localhost:3000
AUTH_SERVICE_URL=http://auth-service:4000/api/v1
NOTIFICATION_SERVICE_URL=http://notification-service:4006/api/v1
```

### 7.3 Secrets Management Recommendation
- Do not commit real credentials/API keys for production.
- Use environment-specific secret stores (Vault, cloud secret manager, CI/CD secrets).

---

## 8. Data Persistence

### 8.1 Persisted Data
- PostgreSQL data -> `postgres_data`
- Redis append-only data -> `redis_data`
- Ollama model cache -> `ollama_data`
- Prometheus TSDB -> `prometheus_data`
- Grafana state -> `grafana_data`
- Elasticsearch indices -> `elasticsearch_data`

### 8.2 Backup Examples
PostgreSQL dump:
```bash
docker exec -t serenity_space_postgres pg_dump -U postgres mentalhealth > backup.sql
```

Redis snapshot (AOF/RDB depending on config):
```bash
docker exec -t serenity_space_redis redis-cli -a "$REDIS_PASSWORD" SAVE
```

### 8.3 Restore Example
```bash
cat backup.sql | docker exec -i serenity_space_postgres psql -U postgres -d mentalhealth
```

---

## 9. Troubleshooting and Common Issues

### 9.1 Port Conflict
Symptoms: container fails to start, bind errors.

Check usage:
```bash
# Linux/macOS
lsof -i :4000
lsof -i :5432
```

Fix:
- stop conflicting process, or
- remap ports in `docker-compose.yml`.

### 9.2 Missing/Invalid Environment Variables
Symptoms: app exits on boot, auth/db failures.

Check effective env:
```bash
docker compose config
```

Inspect container env:
```bash
docker exec -it serenity_space_auth env | sort
```

### 9.3 Build Issues
Symptoms: npm/native module errors during image build.

Rebuild without cache:
```bash
docker compose build --no-cache
```

Then restart:
```bash
docker compose up -d
```

### 9.4 Healthcheck Failures
Possible cause: `curl` not present in minimal runtime images.

Inspect:
```bash
docker compose ps
docker compose logs -f auth-service
```

If service is actually running but marked unhealthy, adjust healthcheck command in compose or install required utility in image.

### 9.5 Container Inspection Commands
```bash
docker ps
docker compose ps
docker inspect serenity_space_chat
docker compose logs -f chat-service
```

---

## 10. Testing and Validation

### 10.1 Verify All Containers Are Running
```bash
docker compose ps
```

### 10.2 Quick Health Checks
```bash
curl -f http://localhost:4000/api/v1/health
curl -f http://localhost:4001/api/v1/health
curl -f http://localhost:4002/api/v1/health
curl -f http://localhost:4003/api/v1/health
curl -f http://localhost:4004/api/v1/health
curl -f http://localhost:4005/api/v1/health
curl -f http://localhost:4006/api/v1/health
```

### 10.3 Infra Checks
```bash
curl -f http://localhost:5432 || true   # TCP service, HTTP check not applicable
curl -f http://localhost:9200
curl -f http://localhost:9090/-/healthy
curl -f http://localhost:11434/api/tags
```

### 10.4 Compose Dependency Validation
```bash
docker compose events
```
Use this while starting to verify dependency order and restart behavior.

---

## 11. Deployment Notes (Production vs Development)

### 11.1 Local Development
- Suitable for full-stack local integration testing.
- Includes developer utilities (Adminer, Redis Commander, Kibana UI).

### 11.2 Production Considerations
- Do not expose all internal ports publicly.
- Put gateway/services behind firewall and TLS termination.
- Store secrets outside `.env` committed files.
- Use stricter health checks and resource limits.
- Configure backups for DB/Elasticsearch volumes.
- Consider separate Compose overrides or orchestrator (Kubernetes/Swarm) for scaling.

### 11.3 Security Notes
- Rotate JWT secrets and DB credentials.
- Restrict Grafana/Adminer/Redis Commander access.
- Keep Elasticsearch/Kibana security enabled in production.

---

## 12. Known Compose-Level Caveats in Current Configuration

The following items are present in current files and should be reviewed:
- `scheduler-service` env includes `NOTIFICATION_SERVICE_URL= ${NOTIFICATION_SERVICE_URL}` (extra space after `=` may produce unexpected value parsing).
- Some Dockerfile `EXPOSE` ports do not match service runtime ports (metadata issue; routing still controlled by Compose `ports`).
- `user-service` sets `PORT=${PORT_AUTH}` in Compose env; validate this is intentional.
- Healthchecks use `curl` for service containers; ensure runtime image includes `curl` or use an alternative healthcheck command.

These do not necessarily block startup in every environment but are important for reliable deployment.

---

## 13. Quick Start Summary

```bash
cd s-main
# 1) Verify .env values
# 2) Build and start
docker compose up -d --build

# 3) Verify status
docker compose ps

# 4) Follow logs if needed
docker compose logs -f
```

This document is standalone and suitable for integration into the project’s final technical documentation package.
