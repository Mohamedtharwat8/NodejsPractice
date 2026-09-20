# Procurement Portal

A multi-tenant procure-to-pay platform: companies (tenants) raise purchase requests, get them approved, and issue purchase orders to vendors. It is also a hands-on project for a full-stack Angular + Node.js skill set (see the coverage matrix below).

**Status:** phases 1-10 are implemented and phase 11 is in progress. The Angular client now includes authentication, a role-aware responsive shell, dashboard, request list, and a reactive request form with AI-assisted justification drafting. Phases 12-13 remain planned.

## Business Requirements (BRD)

### Problem
Purchasing in small and mid-size companies runs on email and spreadsheets: no approval trail, duplicate orders, no view of spend per vendor.

### Goals
1. One place to request, approve and order purchases with a full audit trail.
2. Enforce who may approve what (roles, no self-approval).
3. Serve many companies from one deployment with strict data isolation.
4. Use AI to cut manual work (drafting requests, choosing vendors, summarising spend).

### Users and roles
| Role | Can do |
| --- | --- |
| Requester | Create/edit draft requests, submit, track own requests |
| Approver | Approve or reject submitted requests (not their own) |
| Procurement | Manage vendors, issue and cancel purchase orders |
| Admin | Manage users; all of the above |

### Functional requirements
| ID | Requirement | Phase |
| --- | --- | --- |
| FR1 | Login with JWT; role-based access | 1-2 (done) |
| FR2 | Vendor management with soft deactivation | 1-2 (done) |
| FR3 | Purchase request lifecycle DRAFT → SUBMITTED → APPROVED/REJECTED | 1-2 (done) |
| FR4 | Approval decisions recorded with comment, atomically | 1-2 (done) |
| FR5 | Purchase order from approved request, one per request, sequential PO number | 1-2 (done) |
| FR6 | Audit log of every state change | 1-2, MongoDB trail in 7 (done) |
| FR7 | Tenant isolation: no user can read or write another tenant's data | 3 (done) |
| FR8 | Notifications to approvers/requesters on state changes | 8 (done), own service in 9 |
| FR9 | AI: draft justification, recommend vendor, summarise spend | 10 |
| FR10 | Web UI for all flows | 11 |

### Non-functional requirements
- **Security:** hashed passwords, JWT, rate-limited login, helmet, input validation on every endpoint, tenant filter enforced centrally.
- **Performance:** cached hot reads, indexed list queries, cursor pagination.
- **Compatibility:** versioned API (`/api/v1`) with a deprecation policy.
- **Operability:** dockerised, CI on every PR, health checks, correlation ids in logs.
- **Documentation:** OpenAPI spec served at `/docs`.

### Out of scope (for now)
Invoicing and payments, RFQ/bidding, goods receipt, SSO, mobile app.

## Skills coverage
| Job requirement | Where it is covered |
| --- | --- |
| Angular, TypeScript, SCSS, RxJS, reactive forms, modular components | Phase 11 `client/` |
| Node.js APIs, async programming, middleware | Done (Express 5 middleware chain, BullMQ jobs in phase 8) |
| Microservices design | Phase 9: `notification-service`, `ai-service` |
| PostgreSQL schema design, query optimisation | Prisma schema (done); indexes, `EXPLAIN` and load testing in phase 6 (done, see [docs/performance.md](docs/performance.md)) |
| MongoDB | Phase 7 (done): audit trail |
| Redis caching | Phase 5 (done: cache, rate limit, revocation, job queues) |
| Multi-tenant SaaS | Phase 3 (done) |
| API versioning and documentation | Phase 4 (done) |
| AI/LLM integration | Phase 10 |
| Git, CI/CD, Docker | Phase 12 (done: Dockerfiles, compose, GitHub Actions); phase 13 |
| Jira, Agile | Phase 13: epics/stories per phase |

## Roadmap
1. Foundation and schema — done
2. Auth, vendors, purchase requests, approvals, purchase orders — done
3. Multi-tenancy — done
4. API versioning + OpenAPI docs — done
5. Redis caching and rate limiting — done
6. Query optimisation and cursor pagination — done
7. MongoDB audit trail — done
8. Background jobs and notifications — done
9. Extract microservices — done
10. AI features — done
11. Angular client — done
12. Docker, docker-compose, GitHub Actions — done
13. Process: Jira-style backlog, conventional commits, PR template

Architecture decisions for each phase (tenancy model, which store owns what, service boundaries) are in `plans/02-full-stack-roadmap.md`.

## Running what exists today
1. `npm install`
2. `docker compose up -d --wait` (PostgreSQL on host port 55432, Redis on 56379 and MongoDB on 57017; the default ports fall in ranges Windows reserves on some machines).
3. Copy `.env.example` to `.env` and set `JWT_SECRET`. `REDIS_URL` is optional; `MONGODB_URL` holds the audit trail (see below).
4. `npm run db:migrate`, then `npm run db:seed`.
5. `npm run dev`, then `GET /health`. Interactive API docs: <http://localhost:3000/docs> (raw spec at `/docs/openapi.json`).

Seeded tenants `acme` and `globex`, each with users (password `Password123!`): `admin@`, `requester@`, `approver@`, `procurement@` `example.com`. Log in with the tenant slug, e.g. `{"tenant":"acme","email":"admin@example.com","password":"Password123!"}`.

### Multi-tenancy
Shared database, shared schema: every business table carries `tenantId`. The JWT carries the tenant (`tid`); the auth middleware stores it in an `AsyncLocalStorage` context, and a Prisma client extension ([src/db/prisma.js](src/db/prisma.js)) adds `tenantId` to every query and fails closed when there is no tenant. Avoid raw SQL (`$queryRaw`), which bypasses that filter. Cross-tenant ids return 404. Suspending a tenant blocks new logins; existing tokens live until they expire (8h by default).

### Redis (phase 5)
Redis holds only data that can be lost or rebuilt, so the API works without it (`REDIS_URL` unset or Redis down) and `/health` just reports `redis: up | down | disabled`.

| Use | Behaviour | If Redis is unavailable |
| --- | --- | --- |
| Read cache | Vendor lists and details (5 min) and request details (1 min), keyed `t:{tenantId}:...`; every write invalidates. Rules that decide on a request's state (edit, submit, approve, PO creation) always read the database. | Reads go to the database |
| Login rate limit | 20 attempts per IP per 15 min (`LOGIN_RATE_LIMIT`), counted in Redis so all API instances share it; answers `429 RATE_LIMITED` | In-memory limiter per process |
| Logout | `POST /auth/logout` revokes the token's `jti` until it expires | Logout answers `503`; tokens already revoked are honoured again until they expire (`JWT_EXPIRES_IN`) |
| Tenant status | Suspended tenants are blocked on every request (status cached 60s, invalidated on change) | Read from the database |

Set `CACHE_DEBUG=1` to log every cache hit and miss.

### Audit trail (phase 7)
Every state change (requests, approvals, purchase orders, vendors, users, tenant creation and suspension) is recorded with the actor, a before/after snapshot and the `X-Request-Id` of the request that caused it. Admins search it with `GET /audit` (filters `entity`, `entityId`, `actorId`, `action`, `from`, `to`; cursor paging).

- **Transactional outbox:** the event is written to the Postgres table `AuditOutbox` in the same transaction as the change, so a change and its event commit or roll back together. A drain worker (every 5 s, and before each `GET /audit`) moves events to the MongoDB collection `audit_events` and deletes them from Postgres.
- **MongoDB outage:** business requests never touch Mongo, so they keep working; events wait in the outbox and are delivered when Mongo returns. Draining is idempotent (unique `outboxId`), so retries and concurrent workers never duplicate events. `GET /audit` answers `503` while Mongo is unreachable.
- **Retention:** each event carries `expireAt = at + AUDIT_RETENTION_DAYS` (default 2555, about 7 years) and MongoDB deletes it then through a TTL index. Events are append-only: the application never updates them.
- **Backfill:** the phase 6 `AuditLog` table became the outbox, so existing rows drained into MongoDB with their original timestamps.
- **Tenant isolation:** audit queries are always filtered by the caller's tenant and fail closed without one, like the Prisma extension.
- **Local setup notes:** `MONGODB_URL` uses `127.0.0.1` because `localhost` failed the driver handshake on the development machine. Mongoose is pinned to 8.x because the 9.x driver (7.x) could not connect from inside Jest here.

### Notifications and background jobs (phase 8)
State changes publish domain events that background jobs turn into in-app notifications, email and tenant webhooks. Requests never wait for any of it.

| Event | Notifies | Webhook |
| --- | --- | --- |
| `REQUEST_SUBMITTED` | Approvers and admins (not the submitter) | no |
| `REQUEST_DECIDED` | The requester | no |
| `PO_ISSUED` | The requester | yes |
| `PO_CANCELLED` | nobody | yes |

- **Outbox → queue → worker:** the event is written to the Postgres table `EventOutbox` in the same transaction as the change; a relay publishes it to BullMQ (Redis) and deletes it; a worker consumes it. Job ids come from the outbox row (`notify-12`), so republishing never duplicates a job. Without Redis, events simply wait in the outbox.
- **Exactly once for the user:** the in-app notification has a unique key on (user, event, type), so retries, crash recovery and duplicate deliveries create nothing new. Email is at-least-once (it is marked sent right after sending; a crash between the two can send that one message twice). Webhooks are at-least-once too: dedupe on `X-Event-Id`.
- **Retries:** each job is tried `JOB_ATTEMPTS` times (default 5) with exponential backoff from `JOB_BACKOFF_MS` (default 2 s). A job whose worker dies mid-run is picked up again by the next worker. Jobs that run out of attempts, or fail in a way a retry cannot fix (bad URL, a 4xx answer other than 408/429), move to the dead-letter queue; `GET /platform/dead-letters` lists them and `POST /platform/dead-letters/{id}/retry` requeues one with a fresh budget.
- **Email:** `SMTP_URL` sends real mail. Without it messages are only built and logged, nothing leaves the process.
- **Webhooks:** tenant admins set a URL with `PUT /settings/webhook`; the response shows the signing secret once. Each call is a JSON POST with `X-Event-Id`, `X-Event-Type`, `X-Timestamp`, `X-Request-Id` and `X-Signature: sha256=<hex>`, an HMAC-SHA256 of `"<timestamp>.<raw body>"` with the secret. Receivers should check the signature, reject old timestamps and dedupe on the event id. URLs must be https and must not point at private, local or link-local addresses; the check looks at the hostname only, so also restrict outbound traffic at the network level in production. `ALLOW_INSECURE_WEBHOOKS=1` lifts the check for local development.
- **Tracing:** the request id is stored with the event and comes back on the job, the webhook call and any audit event the job writes.
- **Running it:** the API process keeps only the audit drain beside the HTTP server; the notification relay and worker move into the separate `notification-service`. A legacy local run can temporarily re-enable the old behaviour with `ENABLE_LEGACY_NOTIFICATION_WORKER=1`.

### Extracted services and AI (phases 9-10)
The notification relay/worker and AI runtime are independently runnable from `services/`. Both expose `/health` and `/ready`, have graceful shutdown, Dockerfiles, and share validated payload contracts from `packages/contracts`.

The AI service provides justification drafting, vendor recommendations, and spend summaries. Requests require a signed tenant token outside tests. Prompts are versioned; calls have timeout/retry handling, validated structured output, a Redis-backed monthly tenant cap (with a local development fallback), and `AiInteraction` usage records in MongoDB. If `AI_API_KEY` is unset, a deterministic local provider supports development; provider failure never blocks manual entry. Suggestions return an `interactionId`, and `POST /interactions/:id/accept` records when a user keeps one.

### Angular client (phase 11, in progress)
The standalone Angular 22 app is in `client/`. Run the API and AI service, then `npm run start:client`; its development proxy routes `/api` and `/ai` to the local services. The delivered first slice includes login, role guards, token/401 interception, responsive navigation, the dashboard, live request listing, and a reactive request form with a validated dynamic line-item array and AI drafting. Approval, vendor, order, and audit routes are protected and scaffolded for the next slice.

### API versioning and errors
Business endpoints live under `/api/v1`; `/health` and `/docs` are unversioned. Every response carries `X-API-Version`. A deprecated version keeps working for at least six months and answers with `Deprecation`, `Sunset` and `Link: <successor>; rel="successor-version"` headers (registry in [src/config/versions.js](src/config/versions.js)).

Errors always look like `{ "error": { "code", "message", "details"? } }` with codes `VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`.

The OpenAPI spec is built from the same zod schemas the routes validate with ([src/docs/openapi.js](src/docs/openapi.js)); a contract test fails if a route is undocumented or a documented route is missing.

### Endpoints (paths relative to `/api/v1`)
| Method & path | Roles |
| --- | --- |
| `POST /platform/tenants` (creates tenant + first admin; header `x-platform-key`, needs `PLATFORM_API_KEY`) | platform owner |
| `PATCH /platform/tenants/:id/status` (`ACTIVE` or `SUSPENDED`; header `x-platform-key`) | platform owner |
| `GET /notifications` (`unread`, `pageSize`, `cursor`), `POST /notifications/read-all`, `POST /notifications/:id/read` | any (own notifications) |
| `GET /settings/webhook`, `PUT /settings/webhook` (`url` or `null`, `rotateSecret`) | ADMIN |
| `GET /platform/dead-letters`, `POST /platform/dead-letters/:id/retry` (header `x-platform-key`) | platform owner |
| `GET /audit` (query: `entity`, `entityId`, `actorId`, `action`, `from`, `to`, `pageSize`, `cursor`) | ADMIN |
| `POST /auth/login` (body: `tenant`, `email`, `password`) | public |
| `POST /auth/logout` (revokes the current token) | any |
| `POST /auth/register` | ADMIN |
| `GET /auth/me` | any |
| `GET /vendors`, `GET /vendors/:id` | any |
| `POST /vendors`, `PATCH /vendors/:id`, `DELETE /vendors/:id` (deactivates) | PROCUREMENT, ADMIN |
| `POST /purchase-requests`, `GET /purchase-requests`, `GET /:id` | any (requesters see only their own) |
| `PATCH /purchase-requests/:id`, `POST /:id/submit` | owner, while DRAFT |
| `POST /purchase-requests/:id/approve`, `/reject` | APPROVER, ADMIN (not own request) |
| `POST /purchase-orders`, `GET /purchase-orders`, `GET /:id`, `POST /:id/cancel` | PROCUREMENT, ADMIN |

List endpoints accept `status`, `page` and `pageSize`. Requests and purchase orders also accept `cursor`: pass the `nextCursor` from the previous response to get the next page (`null` on the last page). Cursor pages cost the same at any depth and skip the `COUNT`, so their response has no `total`/`page`; use them for large lists.

### Performance
`npm run db:load` generates 100,000 requests in a separate `loadtest` tenant, `npm run explain` prints query plans and `npm run bench` measures endpoint latency. Findings, before/after numbers and the rejected `relationJoins` experiment are in [docs/performance.md](docs/performance.md).

### Tests
`npm test` needs the migrated and seeded database, Redis and MongoDB from `.env` (`docker compose up -d --wait`). `tests/redis-down.test.js` and `tests/audit-down.test.js` cover the no-Redis and no-MongoDB behaviour. Run it in band (`npm test` does): the tests share the login rate-limit counter. Stop any running dev server first: its worker would take jobs from the same Redis queue and the queue tests would miss them.

## Run everything with Docker

```bash
docker compose up --build                            # postgres, redis, mongo, migrate, api, services, client
docker compose run --rm migrate node prisma/seed.js  # demo tenants and users (first run only)
```

Open http://localhost:8080 and sign in as `requester@example.com` / `Password123!` (tenant `acme`). nginx in the client image proxies `/api` to the API and `/ai` to the AI service. Secrets and the LLM key come from the environment or a root `.env` (`JWT_SECRET`, `PLATFORM_API_KEY`, `AI_API_KEY`, `SMTP_URL`); without `AI_API_KEY` the AI service uses its local fallback.

Per-service settings are documented in `services/*/.env.example`.

## CI

`.github/workflows/ci.yml` runs on every pull request: ESLint and the Jest suite against Postgres, Redis and MongoDB service containers; the client build, unit tests and Playwright smoke test; an image build for the api, ai-service, notification-service and client; and a `docker compose up --wait` smoke test. Pushing a `v*` tag also publishes the images to GHCR. Make the checks required in branch protection so a failing test blocks the merge.
