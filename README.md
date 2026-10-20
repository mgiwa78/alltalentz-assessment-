# TRS Restoration Estimating API

Backend for a simplified **property restoration estimating** system. Estimators record restoration jobs (customer, property, damage), move them through a controlled lifecycle, price them, and produce an **AI-ready damage assessment payload**. A live **Claude** analysis of that payload is available when an API key is configured.

- **Runtime:** Node.js 22, TypeScript, Express 5
- **Data:** PostgreSQL (TypeORM, committed migration), Redis (cache, rate limits, refresh tokens), with an in-memory Redis driver for local dev and tests
- **Validation:** zod v4. The same schemas generate the OpenAPI request bodies.
- **Auth:** email + password (scrypt), RS256 JWT access tokens plus rotating single-use refresh tokens, role-based authorization
- **AI:** Anthropic SDK (`claude-opus-5-5`, structured outputs) behind a provider interface
- **Docs:** Swagger UI at **`/api/docs`** (OpenAPI 3.1 JSON at `/api/docs.json`)
- **Tests:** Jest. Unit specs need no infrastructure; integration tests drive the real app over HTTP against PostgreSQL.
- **CI:** GitHub Actions (lint, typecheck, unit + integration tests, build)

> Every REST endpoint is under **`/api/v1`**, for example `POST /api/v1/jobs`.

---

## Contents

1. [Quick start](#quick-start)
2. [Configuration](#configuration)
3. [Database](#database)
4. [Running and testing](#running-and-testing)
5. [Authentication and roles](#authentication-and-roles)
6. [API reference](#api-reference)
7. [Job status rules](#job-status-rules)
8. [AI-ready damage assessment](#ai-ready-damage-assessment)
9. [Request and response contract](#request-and-response-contract)
10. [Project layout](#project-layout)
11. [Design decisions](#design-decisions)
12. [Known limitations](#known-limitations)

---

## Quick start

Requirements: Node.js 22+, PostgreSQL 13+.

```bash
npm install
cp .env.example .env              # set DB_PASSWORD (and DB_* if not localhost/postgres)

# create the databases (psql or any client)
#   CREATE DATABASE trs_restoration;
#   CREATE DATABASE trs_restoration_test;   -- only needed for integration tests

npm run migrate                   # apply the schema
npm run seed                      # staff accounts + 24 sample jobs (resets the dev database)
npm run dev                       # http://localhost:4000/api/docs
```

`.env.example` sets `REDIS_DRIVER=memory`, so no Redis server is required locally.

### Try it

1. In Swagger, call `POST /auth/login` with `estimator@trs.test` / `Password123!`.
2. Click **Authorize** and paste the `accessToken`.
3. Call `GET /jobs/JOB-001`. This is the job from the brief: John Smith, WATER, 450 sq ft, `NEW`.

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"estimator@trs.test","password":"Password123!"}' | jq -r .response.accessToken)

curl -s -X POST localhost:4000/api/v1/jobs/JOB-001/estimate -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"laborCost":1500,"materialCost":2000,"equipmentCost":500}' \
  | jq .response.estimatedCost   # 4000
```

### Seeded accounts

All seeded accounts share the password `Password123!` (override it with `SEED_USER_PASSWORD`).

| Email | Role |
| --- | --- |
| `admin@trs.test` | ADMIN |
| `estimator@trs.test`, `estimator2@trs.test` | ESTIMATOR |
| `pm@trs.test` | PROJECT_MANAGER |

---

## Configuration

All settings come from environment variables, which are parsed and validated at boot in `src/config/index.ts`. `.env.example` lists every variable.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `NODE_ENV` | `development` | `development` / `test` / `staging` / `production`. Stack traces are only returned in development. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SSL` | `localhost`, `5432`, `trs_restoration`, `postgres`, `postgres`, `false` | PostgreSQL connection |
| `TEST_DB_NAME` | `trs_restoration_test` | Database the integration tests drop and rebuild |
| `REDIS_DRIVER` | `redis` | `redis` for a real server, `memory` for an in-process Redis (single instance only) |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `REDIS_KEY_PREFIX` | `localhost`, `6379`, empty, `0`, `trs` | Redis connection |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | empty | RS256 keypair, raw or base64 PEM. `npm run keys:generate` prints a pair. **Required in production.** Outside production a per-process keypair is generated, so tokens stop working after a restart. |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | `15m`, `7d` | Token lifetimes |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_MULTIPLIER` | `900000`, `1000`, `1` | General rate limit, and a multiplier applied to every preset |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS allow-list (comma-separated; `*.example.com` supported) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `ANTHROPIC_API_KEY` | empty | Enables `POST /jobs/:id/ai-assessment/analyze`. Without it, the payload endpoint still works. |
| `AI_MODEL`, `AI_EFFORT`, `AI_TIMEOUT_MS` | `claude-opus-5-5`, `medium`, `120000` | Claude model, effort level and request timeout |
| `SEED_USER_PASSWORD` | `Password123!` | Password for seeded staff accounts |

---

## Database

PostgreSQL. The schema lives in a committed TypeORM migration: [`src/database/migrations/`](src/database/migrations).

| Table | Purpose |
| --- | --- |
| `jobs` | Restoration jobs. Primary key `id` (`JOB-001`), unique `job_number`, money as `NUMERIC(12,2)`, CHECK constraints on status, damage type, square feet and non-negative costs, indexes on status, damage type and created_at |
| `job_status_history` | Append-only status trail: from, to, who, note, when. FK to `jobs` with `ON DELETE CASCADE`. |
| `users` | Staff accounts: unique email, scrypt password hash, role (CHECK constraint), active flag, session revocation timestamp |
| `audit_logs` | Who did what: logins, job created / status changed / estimated / AI analyzed, user changes |

| Command | What it does |
| --- | --- |
| `npm run migrate` | Apply pending migrations (alias of `db-migrate:run`) |
| `npm run db-migrate:revert` | Roll back the last migration |
| `npm run db-migrate:generate` | Generate a migration from entity changes |
| `npm run seed` | **Drops the dev database**, re-runs migrations, seeds staff + sample jobs |
| `SEED_RESET=false npm run seed` | Keeps data; only ensures the staff accounts exist |
| `npm run db-migrate:run:prod` / `seed:prod` | Same, against the compiled `dist/` |

Sample jobs are generated with a fixed faker seed, so every run produces the same data. Each job's status history is a valid walk through the [status rules](#job-status-rules).

---

## Running and testing

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start with reload (ts-node-dev) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:check` | ESLint (fix / check) |
| `npm test` | Unit tests: validation, status rules, cost maths, AI payload, roles. **No database needed.** |
| `npm run test:int` | Integration tests: the real app over HTTP against PostgreSQL (`TEST_DB_NAME`) |

The integration suite rebuilds `TEST_DB_NAME` from the committed migration on every run, so it also checks that the migration matches the entities. It never touches `DB_NAME`. Redis runs in memory, and the AI provider is replaced with a fake.

Coverage of the cases the brief asks for:

| Area | Covered by |
| --- | --- |
| Job creation: valid, missing fields, invalid damage type (also email, squareFeet, malformed JSON, roles, concurrent id allocation) | `jobs.int.ts`, `job.validation.spec.ts` |
| Retrieval: existing job, unknown job → 404, malformed id → 400; list filters by status and damage type, pagination, search | `jobs.int.ts` |
| Status: valid transition, invalid transition → 409 (incl. COMPLETED→ESTIMATING, CANCELLED→IN_PROGRESS), invalid status → 400, role ownership → 403 | `jobs.int.ts`, `status-transitions.spec.ts` |
| Estimate: 1500 + 2000 + 500 = 4000 persisted; negative, missing, null and non-numeric values → 400; locked after proposal → 409 | `jobs.int.ts`, `estimate.spec.ts`, `job.validation.spec.ts` |
| AI payload shape, PII exclusion, analyze happy path and failures, auth, admin, audit log | `jobs.int.ts`, `ai.int.ts`, `auth.int.ts`, `admin.int.ts` |

---

## Authentication and roles

`POST /auth/login` returns a 15-minute **access token** and a 7-day **refresh token**. Send the access token as `Authorization: Bearer <token>`. Every endpoint except `/auth/*` and `/health` requires it.

- Refresh tokens are **single-use**: `POST /auth/refresh` rotates them, and reusing an old one returns 401. `POST /auth/logout` revokes one.
- Deactivating a user or changing their role **revokes their existing sessions immediately**. It does not wait for the access token to expire.
- Login answers identically (and takes the same scrypt time) for an unknown email and a wrong password.

Roles are **peers**, not a hierarchy. ADMIN is the only role that holds every permission.

| Capability | ADMIN | ESTIMATOR | PROJECT_MANAGER |
| --- | :-: | :-: | :-: |
| Read jobs, status history | ✓ | ✓ | ✓ |
| Create jobs, submit estimates, AI assessment | ✓ | ✓ | |
| Move a job into INSPECTION / ESTIMATING / PROPOSAL_SENT | ✓ | ✓ | |
| Move a job into APPROVED / IN_PROGRESS / COMPLETED / CANCELLED | ✓ | | ✓ |
| Manage users, read audit log, metrics | ✓ | | |

---

## API reference

Full interactive documentation: **`/api/docs`**. Summary:

| Method & path | Roles | Description |
| --- | --- | --- |
| `POST /auth/login` | public | Email + password → tokens + user |
| `POST /auth/refresh` | public | Rotate a refresh token |
| `POST /auth/logout` | public | Revoke a refresh token |
| `GET /auth/me` | any | Current user |
| `POST /jobs` | ADMIN, ESTIMATOR | Create a job → **201**, `id: JOB-###`, `status: NEW`, `estimatedCost: 0` |
| `GET /jobs` | any | List. Filters: `status`, `damageType`, `search` (name / email / address). Paging: `page`, `limit` (≤100, default 20), `sort=field:asc\|desc` |
| `GET /jobs/:id` | any | One job (id is case-insensitive). Unknown → **404** |
| `PATCH /jobs/:id/status` | per target status | `{ "status": "ESTIMATING", "note"?: "..." }`. Invalid value → 400; disallowed move → 409; wrong role → 403 |
| `GET /jobs/:id/status-history` | any | Audit trail of status changes, oldest first |
| `POST /jobs/:id/estimate` | ADMIN, ESTIMATOR | `{ laborCost, materialCost, equipmentCost }` → `estimatedCost` = sum, saved on the job |
| `POST /jobs/:id/ai-assessment` | ADMIN, ESTIMATOR | Structured payload for an AI service (no AI call) |
| `POST /jobs/:id/ai-assessment/analyze` | ADMIN, ESTIMATOR | Sends the payload to Claude and returns a structured analysis (needs `ANTHROPIC_API_KEY`) |
| `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/:userId` | ADMIN | Staff management |
| `GET /admin/audit-logs` | ADMIN | Filter by `action`, `resourceType`, `resourceId`, `userId`, `from`, `to` |
| `GET /health` | public | Database / Redis / memory check |
| `GET /metrics` | ADMIN | Request counts, latency, error rate (last 5 min) |

Every job response includes the estimate breakdown and `allowedTransitions` (the statuses the job may move to next), so a client can render only valid actions.

---

## Job status rules

Implemented in [`src/modules/jobs/helpers/status-transitions.ts`](src/modules/jobs/helpers/status-transitions.ts). The same table appears in the Swagger description.

```
NEW ──► INSPECTION ──► ESTIMATING ──► PROPOSAL_SENT ──► APPROVED ──► IN_PROGRESS ──► COMPLETED
             ▲              │  ▲             │
             └──────────────┘  └─────────────┘        any non-terminal status ──► CANCELLED
```

| From | Allowed next statuses |
| --- | --- |
| NEW | INSPECTION, CANCELLED |
| INSPECTION | ESTIMATING, CANCELLED |
| ESTIMATING | PROPOSAL_SENT, INSPECTION (re-inspect), CANCELLED |
| PROPOSAL_SENT | APPROVED, ESTIMATING (customer wants a revised price), CANCELLED |
| APPROVED | IN_PROGRESS, CANCELLED |
| IN_PROGRESS | COMPLETED, CANCELLED |
| COMPLETED | none (terminal) |
| CANCELLED | none (terminal) |

Further rules:

- **No skipping steps** (NEW → APPROVED is rejected) and **no no-op moves** (NEW → NEW is rejected).
- **Terminal states are final.** This covers the brief's examples: COMPLETED → ESTIMATING and CANCELLED → IN_PROGRESS both return **409**.
- **A proposal needs a price.** A job cannot move to PROPOSAL_SENT while `estimatedCost` is 0.
- **Prices freeze once quoted.** Estimates can only be submitted while a job is NEW, INSPECTION or ESTIMATING. To re-price after sending a proposal, move the job back to ESTIMATING first, which is itself recorded in the history.
- **Role ownership.** Estimators own the pre-sale steps, project managers own approval, delivery and cancellation, and ADMIN can do anything (see the table above).
- Each change happens in a transaction under a row lock (`SELECT … FOR UPDATE`). Two people moving the same job at once cannot both pass the check. Each change writes a `job_status_history` row and an audit log entry.

Status codes: unknown status value → **400**, disallowed move → **409** (the error body lists the allowed moves), role not allowed → **403**, unknown job → **404**.

---

## AI-ready damage assessment

`POST /jobs/:id/ai-assessment` returns the payload an AI service would receive:

```json
{
  "jobId": "JOB-001",
  "jobStatus": "ESTIMATING",
  "property": { "address": "123 Main Street", "squareFeet": 450 },
  "damage": { "type": "WATER", "description": "Water damage affecting the kitchen ceiling and wall." },
  "currentEstimate": 4000,
  "estimateBreakdown": { "laborCost": 1500, "materialCost": 2000, "equipmentCost": 500 },
  "instructions": "Analyze the reported property damage and suggest appropriate restoration actions.",
  "responseFormat": { "type": "json_schema", "schema": { "...": "JSON Schema of the expected analysis" } }
}
```

- **Data minimisation:** the customer's name and email are never included. The model needs the property and the damage, not who owns them. A unit test enforces this.
- **Contract both ways:** `responseFormat` carries the JSON Schema of the answer we expect. The receiving service doesn't have to guess the output shape, and the same zod schema validates whatever comes back.

`POST /jobs/:id/ai-assessment/analyze` sends that payload to Claude (bonus: real AI integration). See [`src/core/ai/anthropic.provider.ts`](src/core/ai/anthropic.provider.ts):

- **Structured outputs** (`messages.parse` + a zod output format) return a typed `DamageAnalysis`: severity, summary, affected areas, ordered recommended actions with priority, safety concerns, specialist flag, duration, a verdict on the current estimate, and follow-up questions for the site visit.
- The system prompt tells the model to treat the inspector's description as **data, not instructions**, which guards against prompt injection through job notes.
- `fallbacks: "default"`: if a safety classifier declines, the API retries server-side on its recommended fallback model.
- Provider errors are mapped onto the API's error contract: bad key or rate limit → 503, provider failure or unusable output → 502. The endpoint has its own rate limit, and each call is written to the audit log with model, severity and token usage.
- The provider sits behind a `DamageAssessmentProvider` interface (`src/core/ai`), so a different vendor or a queued worker can replace it. Tests swap in a fake.
- The analysis is **advisory**: it is returned to the estimator and is not written onto the job.

---

## Request and response contract

Success:

```json
{ "success": true, "message": "Job created", "response": { "id": "JOB-025", "...": "..." } }
```

Lists return `response: { data: [...], meta: { total, page, limit, totalPages, hasMore } }`.

Errors always share one shape (`src/common/errors/index.ts`):

```json
{
  "success": false,
  "message": "Job not found",
  "code": "NOT_FOUND",
  "timestamp": "2026-10-20T10:00:00.000Z",
  "requestId": "req_..."
}
```

Validation errors add `details: [{ "path": "damageType", "message": "damageType must be one of: WATER, FIRE, MOLD, STORM, OTHER" }]`. Transition conflicts add `details: { from, to, allowed }`. Codes in use: 200, 201, 400 (validation / malformed JSON), 401, 403, 404, 409, 429, 500, 502, 503. Every response carries an `X-Request-ID` header, which also appears in the server logs.

---

## Project layout

```
src/
  app.ts                  Express app: security headers, CORS, logging, docs, routes, error handler
  index.ts                Boot: DB connection, listener, graceful shutdown
  config/                 Env parsing (zod), TypeORM data source, shared service instances (JWT, Redis)
  common/                 Cross-cutting: errors, logger, auth/JWT, middleware (auth, roles, validation,
                          rate limit), monitoring (health, metrics, audit), Redis client, types, helpers
  core/ai/                AI provider interface, Anthropic implementation, analysis schema
  database/
    entities/             User, Job, JobStatusHistory, AuditLog
    enums/                UserRole, DamageType, JobStatus
    migrations/           Committed schema migration
    seeders/              Staff accounts + sample jobs, run by seed-runner.ts
  docs/openapi.ts         OpenAPI 3.1 document (request bodies generated from the zod schemas)
  modules/
    global/               Auth (login, refresh, logout, me)
    jobs/                 Jobs: routes → controller → service → repository, validation, domain helpers
    admin/                User management, audit log
  repository/             BaseRepository: pagination, search, filtering, caching, audit hooks
  routes/root.route.ts    Mounts modules under /api/v1
test/integration/         HTTP-level tests and harness
```

**Layering rule:** routes declare middleware (auth, role, `validate(schema)`) and call a controller. Controllers only translate HTTP to and from the service and never touch the database. Services hold the business rules and transactions. Repositories own queries and response formatting. Pure domain rules (status transitions, cost maths, AI payload) live in `modules/jobs/helpers/` with no I/O, so they are unit-tested directly.

---

## Design decisions

- **PostgreSQL with a committed migration and database-level constraints.** The service validates input, and CHECK constraints, foreign keys and a unique job number back that up in the database. A bad write from a future code path, a script or a manual fix still cannot store an invalid status or a negative price.
- **Human-readable ids (`JOB-001`) without a race.** `job_number` is allocated as `MAX + 1` inside the create transaction, under a Postgres advisory lock. Concurrent creates serialise only on that short critical section. A unique index backs it up, and a test fires 8 concurrent creates. Unlike a sequence, numbers never skip. The trade-off is that creates are serialised; at an estimating team's volume that cost doesn't matter.
- **Money is exact.** Costs are `NUMERIC(12,2)` in the database, validated to at most 2 decimals, and summed in integer cents, so `0.1 + 0.2` cannot drift into a customer's price.
- **The status workflow is data, not scattered `if`s.** One transition table and one role table drive validation, error messages, the `allowedTransitions` field, the Swagger docs and the seed data. Transitions run under a row lock and write an append-only history row (the audit trail bonus).
- **Peer roles instead of a hierarchy.** Estimators and project managers own different halves of the lifecycle, so a ranked hierarchy would be wrong. Permission checks happen at the route where the rule is static, and in the service where it depends on the target status.
- **Strict, explicit validation.** Every request goes through a zod schema. Error messages distinguish *missing* from *wrong type* (`laborCost is required` vs `laborCost must be a number`). Numeric strings such as `"1500"` are rejected rather than coerced, and fields a client may not set (`status`, `estimatedCost`, `id`) are stripped on create. The same schemas generate the OpenAPI request bodies, so the docs can't drift from the validation.
- **Redis with an in-memory driver.** Production uses Redis for caching, rate limiting and refresh-token storage, which lets the API scale horizontally. `REDIS_DRIVER=memory` swaps in `ioredis-mock` behind the same client, so local development and the test suite need only PostgreSQL. That driver is single-instance only.
- **AI is behind an interface and fails closed.** The payload endpoint has no external dependency. The analysis endpoint degrades to a clear 503 when it is not configured, and it never blocks or mutates job data.
- **Structure follows an existing production codebase.** Module layout, BaseRepository, error handling, logging, rate limiting, request IDs, health and metrics, and the audit logger are adapted from an API I maintain, so the code is consistent and ready to extend rather than written for the exercise alone.

---

## Known limitations

- The AI analysis is synchronous (up to `AI_TIMEOUT_MS`). At volume it should move to a queue, with the result stored against the job.
- There is no password reset or self-service sign-up. Staff accounts are created by an ADMIN (`POST /admin/users`).
- Session revocation has one-second granularity: a token issued in the same second as a revocation is also rejected.
- The in-memory Redis driver is for single-process development and testing only.
