# Project Nirvana 🧘✨

> Holistic wellness sanctuary platform for live, time-based 1-on-1 sessions: Yoga, Reiki, Psychotherapy, Pranic Healing, Astrology, Sound Healing, and Spirituality.

---

## 🏗️ Architecture & Monorepo Structure

Built with **pnpm workspaces** and **Turborepo**:

```
.
├── apps/
│   ├── api/             # NestJS modular monolith (:4000)
│   └── web/             # Next.js 14 App Router (:3000)
├── packages/
│   ├── db/              # Prisma ORM + PostgreSQL client + seed scripts
│   ├── shared/          # Zod validation schemas, constants, contracts & types
│   └── config/          # Shared ESLint & strict TypeScript configurations
├── .github/workflows/   # CI pipeline + Staging & Production deploy stubs
└── docker-compose.yml   # Postgres, Redis, Mailpit, MinIO
```

---

## ⚡ Quick Start

### 1. Prerequisites

- **Node.js**: >= 20.x
- **pnpm**: >= 9.x / 10.x
- **Docker & Docker Compose**

### 2. Setup & Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd prana-tattva

# 2. Install workspace dependencies
pnpm install

# 3. Configure environment variables
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env

# 4. Start local infrastructure (Postgres, Redis, Mailpit, MinIO)
docker compose up -d

# 5. Generate Prisma Client and apply migrations/seed
pnpm --filter @project-nirvana/db db:generate
pnpm --filter @project-nirvana/db db:push
pnpm --filter @project-nirvana/db db:seed

# 6. Start development servers
pnpm dev
```

---

## 🌐 Endpoints & Ports

| Service                  | Port / URL                                                   | Notes                                      |
| :----------------------- | :----------------------------------------------------------- | :----------------------------------------- |
| **Frontend Web**         | [http://localhost:3000](http://localhost:3000)               | Next.js 14 App Router, Calm Earthy Theme   |
| **Backend API**          | [http://localhost:4000](http://localhost:4000)               | NestJS Modular Monolith                    |
| **API Health Check**     | [http://localhost:4000/health](http://localhost:4000/health) | Returns `{ status: 'ok', ... }`            |
| **Swagger OpenAPI Docs** | [http://localhost:4000/docs](http://localhost:4000/docs)     | Interactive Swagger UI                     |
| **Mailpit Web UI**       | [http://localhost:8025](http://localhost:8025)               | Local inbox testing (SMTP: `1025`)         |
| **MinIO S3 Console**     | [http://localhost:9001](http://localhost:9001)               | S3 API on `9000` (user/pass: `minioadmin`) |
| **PostgreSQL**           | `localhost:5432`                                             | DB: `nirvana_dev`, user/pass: `postgres`   |
| **Redis**                | `localhost:6379`                                             | BullMQ & session caching                   |

---

## 📜 Engineering Standards & Guarantees

- **Strict TypeScript**: `noImplicitAny: true`, zero `any` types across the codebase.
- **Input Validation**: All DTOs validated via Zod schemas shared between web and api (`@project-nirvana/shared`).
- **Standard Error Envelope**: API errors follow `{ code: string, message: string, details?: unknown }`.
- **Confidentiality & Privacy**: Pino logs strictly redact PII, session notes, mental health details, and auth tokens.
- **Financial Exactness**: Money is stored exclusively as integers in the smallest unit (paise) with currency code.
- **Timezone Discipline**: All timestamps are persisted in UTC; user IANA timezones are handled separately.

---

## 🧪 Testing & Validation

```bash
# Lint all workspaces
pnpm run lint

# Strict typecheck
pnpm run typecheck

# Run unit & integration tests
pnpm run test

# Production build verification
pnpm run build
```
