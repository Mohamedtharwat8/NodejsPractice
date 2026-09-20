# Backlog

Jira-style: each epic is a delivery phase, each story is one deliverable from `plans/05-delivery-phases.md`. Story ids (`P<phase>-S<n>`) go in PR descriptions and branch names. Sizes are relative (S/M/L). New work starts as a story here first.

| Epic | Story | Size | Status |
| --- | --- | :-: | --- |
| **P1 Foundation** | P1-S1 Schema and migrations for users, vendors, requests, approvals, orders | M | Done |
| **P2 Core API** | P2-S1 JWT auth with roles | M | Done |
| | P2-S2 Vendors CRUD | S | Done |
| | P2-S3 Requests, approvals, purchase orders with business rules BR1-BR7 | L | Done |
| | P2-S4 Service and repository layers | M | Done |
| **P3 Multi-tenancy** | P3-S1 Tenant model and backfill migration | M | Done |
| | P3-S2 Tenant filter in a Prisma extension | L | Done |
| | P3-S3 Cross-tenant isolation tests, platform onboarding | M | Done |
| **P4 Versioning and docs** | P4-S1 `/api/v1`, deprecation policy | S | Done |
| | P4-S2 OpenAPI spec at `/docs` with a contract test | M | Done |
| **P5 Redis** | P5-S1 Tenant-keyed cache with invalidation | M | Done |
| | P5-S2 Shared rate limit, token revocation, graceful degradation | M | Done |
| **P6 Query optimisation** | P6-S1 Indexes from EXPLAIN plans | M | Done |
| | P6-S2 Cursor pagination, load data set, benchmark | M | Done |
| **P7 Audit** | P7-S1 Outbox and MongoDB audit trail with retention | L | Done |
| **P8 Queues** | P8-S1 Event outbox, BullMQ relay and worker | L | Done |
| | P8-S2 Email and webhook notifications, dead letters | M | Done |
| **P9 Services** | P9-S1 Notification service extracted from the API | M | Done |
| | P9-S2 Health endpoints and service boundary tests | S | Done |
| **P10 AI** | P10-S1 ai-service: draft justification, vendor recommendation, spend summary | L | Done |
| | P10-S2 Token cap, retries, timeouts, fallback provider | M | Done |
| **P11 Client** | P11-S1 Auth, tenant login, role guards, interceptors | L | Done |
| | P11-S2 Requests, approvals, vendors, orders, audit, admin, notifications | L | Done |
| | P11-S3 Generated API types, unit tests, Playwright smoke test | M | Done |
| **P12 DevOps** | P12-S1 Dockerfiles and full-stack compose with health checks | M | Done |
| | P12-S2 GitHub Actions: lint, tests with service containers, image build, publish on tag | M | Done |
| **P13 Hardening and release** | P13-S1 Authorisation matrix test | M | Done |
| | P13-S2 Security pass: secrets guard, CORS, proxy trust, audit, secret scan | M | Done |
| | P13-S3 Load test of the main flow (found and fixed the PO numbering race) | M | Done |
| | P13-S4 Runbook, backup and restore notes | S | Done |
| | P13-S5 Backlog, PR template, release notes | S | Done |
| | P13-S6 BR9 approval limits: schema (`approvalLimit` on user and tenant settings), check in approve, admin UI, tests | M | **Open** |

## Ideas not scheduled
- Per-tenant counter for PO numbers if one tenant ever needs more than a few orders per second (see `docs/load-test.md`).
- Upgrade Prisma once a stable release removes the `deepmerge-ts` advisory (see `docs/security.md`).
- Invoicing, RFQ/bidding, goods receipt, SSO (out of scope for 1.0).
