# SerenitySpace

SerenitySpace е full-stack платформа за подкрепа на менталното здраве, проектирана за multi-tenant употреба. Интегрира модерни технологии, за да предостави AI-базирана помощ, сигурна автентикация и интерактивен frontend. Проектът е структуриран модулно и е подготвен за скалиране в development и production среда.

---

## Съдържание
- [Преглед на проекта](#преглед-на-проекта)
- [Функционалности](#функционалности)
- [Архитектура](#архитектура)
- [Използвани технологии](#използвани-технологии)
- [Setup и инсталация](#setup-и-инсталация)
- [Употреба](#употреба)

---

## Преглед на проекта
SerenitySpace предоставя responsive и интерактивна платформа за подкрепа на менталното здраве. Състои се от:

- **Backend** слой от услуги (автентикация, графици, AI/агенти и др.)
- **Frontend** приложение за взаимодействие с потребителя
- Dockerized услуги за лесен старт и deployment

Платформата използва AI модели, microservices и сигурна автентикация за надеждно и мащабируемо потребителско изживяване.

---

## Функционалности
- Multi-tenant автентикация и управление на потребители
- AI интеграция за подкрепа в сферата на менталното здраве
- Планиране в реално време и известия
- Responsive и интерактивен frontend интерфейс
- Пълна контейнеризация за development и deployment

---

## Архитектура
- **Frontend**: [Next.js](https://nextjs.org/) с модулни компоненти, state management и API интеграция
- **Backend**: Microservices архитектура с NestJS, PostgreSQL и Redis
- **AI интеграция**: Ollama модели за персонализирана поддръжка
- **Контейнеризация**: Docker и Docker Compose за опростен setup и консистентност

---

## Използвани технологии
- **Frontend**: Next.js, Tailwind CSS, Node.js
- **Backend**: NestJS, PostgreSQL, Redis, Prisma ORM
- **AI**: Ollama LLM модели
- **DevOps**: Docker, Docker Compose
- **Други**: npm, dotenv за конфигурация

---

## Setup и инсталация

### Предварителни изисквания
- Docker Engine
- Docker Compose
- Node.js
- npm

### Стъпки
1. Клонирайте repository-то:

```bash
git clone <repository-url>
cd serenityspace
```

2. Стартирайте Docker услугите:

```bash
cd s-main
docker compose up --build
```

3. Изтеглете AI модел в Ollama контейнера:

```bash
ollama pull llama3.1:8b
```

4. Стартирайте frontend-а:

```bash
cd serenityspace
npm run dev
```

---

## Употреба
След като услугите са стартирани:

- Отворете frontend-а на `http://localhost:3000`
- Влезте в профила си или създайте нов акаунт
- Използвайте AI функционалностите и модулите за планиране
