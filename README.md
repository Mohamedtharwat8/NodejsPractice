# Procurement Portal

A multi-tenant procure-to-pay platform: companies (tenants) raise purchase requests, get them approved, and issue purchase orders to vendors. It is also a hands-on project for a full-stack Angular + Node.js skill set (see the coverage matrix below).

**Status:** the multi-tenant, versioned and documented core API (phases 1-6) is implemented. Phases 7-13 are planned, not built. Local planning notes live in `plans/` (gitignored); everything needed is summarised here.

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
| FR6 | Audit log of every state change | 1-2 (done), moves to MongoDB in 7 |
| FR7 | Tenant isolation: no user can read or write another tenant's data | 3 (done) |
| FR8 | Notifications to approvers/requesters on state changes | 8-9 |
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
| Node.js APIs, async programming, middleware | Done (Express 5 middleware chain); queues in phase 8 |
| Microservices design | Phase 9: `notification-service`, `ai-service` |
| PostgreSQL schema design, query optimisation | Prisma schema (done); indexes, `EXPLAIN` and load testing in phase 6 (done, see [docs/performance.md](docs/performance.md)) |
| MongoDB | Phase 7: audit trail |
| Redis caching | Phase 5 (done: cache, rate limit, revocation); queues in phase 8 |
| Multi-tenant SaaS | Phase 3 (done) |
| API versioning and documentation | Phase 4 (done) |
| AI/LLM integration | Phase 10 |
| Git, CI/CD, Docker | Phases 12-13 |
| Jira, Agile | Phase 13: epics/stories per phase |

## Roadmap
1. Foundation and schema — done
2. Auth, vendors, purchase requests, approvals, purchase orders — done
3. Multi-tenancy — done
4. API versioning + OpenAPI docs — done
5. Redis caching and rate limiting — done
6. Query optimisation and cursor pagination — done
7. MongoDB audit trail
8. Background jobs and notifications
9. Extract microservices
10. AI features
11. Angular client
12. Docker, docker-compose, GitHub Actions
13. Process: Jira-style backlog, conventional commits, PR template

Architecture decisions for each phase (tenancy model, which store owns what, service boundaries) are in `plans/02-full-stack-roadmap.md`.

## Running what exists today
1. `npm install`
2. `docker compose up -d --wait` (PostgreSQL on host port 55432 and Redis on 56379; the default ports fall in ranges Windows reserves on some machines).
3. Copy `.env.example` to `.env` and set `JWT_SECRET`. `REDIS_URL` is optional (see below).
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

### API versioning and errors
Business endpoints live under `/api/v1`; `/health` and `/docs` are unversioned. Every response carries `X-API-Version`. A deprecated version keeps working for at least six months and answers with `Deprecation`, `Sunset` and `Link: <successor>; rel="successor-version"` headers (registry in [src/config/versions.js](src/config/versions.js)).

Errors always look like `{ "error": { "code", "message", "details"? } }` with codes `VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`.

The OpenAPI spec is built from the same zod schemas the routes validate with ([src/docs/openapi.js](src/docs/openapi.js)); a contract test fails if a route is undocumented or a documented route is missing.

### Endpoints (paths relative to `/api/v1`)
| Method & path | Roles |
| --- | --- |
| `POST /platform/tenants` (creates tenant + first admin; header `x-platform-key`, needs `PLATFORM_API_KEY`) | platform owner |
| `PATCH /platform/tenants/:id/status` (`ACTIVE` or `SUSPENDED`; header `x-platform-key`) | platform owner |
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
`npm test` needs the migrated and seeded database and Redis from `.env` (`docker compose up -d --wait`). `tests/redis-down.test.js` covers the no-Redis behaviour.
