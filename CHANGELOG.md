# Release notes

## 1.0.0

First release of the multi-tenant procurement portal: request → approval → purchase order, with an Angular client.

### Platform
- Multi-tenant API (`/api/v1`) with tenant isolation enforced in one Prisma extension, roles (requester, approver, procurement, admin) and platform onboarding.
- OpenAPI documentation at `/docs`, checked against the mounted routes by a test.
- Redis caching, shared rate limiting and token revocation; the API keeps working when Redis or MongoDB is down.
- Cursor pagination and indexed list queries (p95 under 50 ms at 100,000 requests).
- Audit trail in MongoDB via a Postgres outbox, with retention.
- Event outbox with BullMQ delivery of email and webhook notifications, retries and dead letters.
- Notification service and AI service (draft justification, vendor recommendation, spend summary) run as separate processes.
- Angular client with lazy-loaded feature areas, role guards, reactive forms and AI helper buttons.
- Docker images for every service, a one-command `docker compose up`, and GitHub Actions CI that publishes images on version tags.

### Hardening in this release
- Production refuses placeholder or short `JWT_SECRET` and `PLATFORM_API_KEY` values.
- CORS is closed by default in production; `CORS_ORIGINS` opens named origins. `TRUST_PROXY` makes rate limits see the real client behind a proxy.
- Per-endpoint authorisation matrix test covering all 33 routes and 4 roles.
- BR9 approval limits: admins set a tenant threshold (`PUT /settings/approval`) and per-user limits (at registration or `PUT /settings/approval/users/:id`). Approving above the threshold needs an approver whose limit covers the total (`403 APPROVAL_LIMIT_EXCEEDED`); rejecting is never limited and admins are exempt. With no threshold set, behaviour is unchanged. The client's admin page manages the threshold and sets a limit when creating an approver.
- Fixed: concurrent purchase order creation could fail with `409 Already exists` because two orders were given the same number. Numbering is now serialised per tenant and year.
- Fixed: the client returned 502 after the API container was recreated, because nginx cached the old address.

### Upgrade notes
- One additive migration, `approval_limits` (nullable `approvalThreshold` on Tenant and `approvalLimit` on User). Run `prisma migrate deploy` before starting the new API; existing behaviour is unchanged until a threshold is set.
- Set `JWT_SECRET` (and `PLATFORM_API_KEY` if you use platform routes) to real values before running with `NODE_ENV=production`, or the API exits at start.
- Docker-based deployments that relied on the open CORS default must list their browser origins in `CORS_ORIGINS`.

### Known limitations
- Purchase order issuing is serialised per tenant; one tenant issuing about 25 orders at the same instant sees p95 around 470 ms.
- `npm audit` reports 3 high findings in the Prisma CLI's dependency chain; accepted, see `docs/security.md`.
- Invoicing, payments, RFQ/bidding, goods receipt, SSO and a mobile app are out of scope.
