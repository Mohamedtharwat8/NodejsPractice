# Procurement Portal

A multi-tenant procure-to-pay platform: companies (tenants) raise purchase requests, get them approved, and issue purchase orders to vendors. It is also a hands-on project for a full-stack Angular + Node.js skill set (see the coverage matrix below).

**Status:** the single-tenant core API (phases 1-2) is implemented. Phases 3-13 are planned, not built. Local planning notes live in `plans/` (gitignored); everything needed is summarised here.

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
| FR7 | Tenant isolation: no user can read or write another tenant's data | 3 |
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
| PostgreSQL schema design, query optimisation | Prisma schema (done); indexes and `EXPLAIN` in phase 6 |
| MongoDB | Phase 7: audit trail |
| Redis caching | Phase 5 (cache, rate limit, queues) |
| Multi-tenant SaaS | Phase 3 |
| API versioning and documentation | Phase 4 |
| AI/LLM integration | Phase 10 |
| Git, CI/CD, Docker | Phases 12-13 |
| Jira, Agile | Phase 13: epics/stories per phase |

## Roadmap
1. Foundation and schema — done
2. Auth, vendors, purchase requests, approvals, purchase orders — done
3. Multi-tenancy
4. API versioning + OpenAPI docs
5. Redis caching and rate limiting
6. Query optimisation and cursor pagination
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
2. `docker compose up -d --wait postgres` (PostgreSQL on host port 55432; 5432-5433 are reserved by Windows on some machines).
3. Copy `.env.example` to `.env` and set `JWT_SECRET`.
4. `npm run db:migrate`, then `npm run db:seed`.
5. `npm run dev`, then `GET /health`.

Seeded users (password `Password123!`): `admin@`, `requester@`, `approver@`, `procurement@` `example.com`.

### Endpoints (current, unversioned)
| Method & path | Roles |
| --- | --- |
| `POST /auth/login` | public |
| `POST /auth/register` | ADMIN |
| `GET /auth/me` | any |
| `GET /vendors`, `GET /vendors/:id` | any |
| `POST /vendors`, `PATCH /vendors/:id`, `DELETE /vendors/:id` (deactivates) | PROCUREMENT, ADMIN |
| `POST /purchase-requests`, `GET /purchase-requests`, `GET /:id` | any (requesters see only their own) |
| `PATCH /purchase-requests/:id`, `POST /:id/submit` | owner, while DRAFT |
| `POST /purchase-requests/:id/approve`, `/reject` | APPROVER, ADMIN (not own request) |
| `POST /purchase-orders`, `GET /purchase-orders`, `GET /:id`, `POST /:id/cancel` | PROCUREMENT, ADMIN |

List endpoints accept `status`, `page`, `pageSize`.

### Tests
`npm test` needs the migrated and seeded database from `.env`.
