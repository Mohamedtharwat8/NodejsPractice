# Security review (phase 13)

Scope: the API, the two services, the client image and the pipeline. Findings are dated 2026-09-20; each row says what was checked and what changed.

## Authorisation matrix
`tests/authz-matrix.test.js` lists every mounted route with the roles allowed to call it and asserts, for every role, that the API returns 403 when it should and lets the call through when it should. It reads the routes from the Express routers, so an endpoint added without a matrix row fails the suite. It also proves that platform routes reject tenant tokens, and that logout revokes a token.

| Area | Who may call |
| --- | --- |
| `POST /auth/login` | anyone (rate limited) |
| `GET /auth/me`, `POST /auth/logout`, notifications, vendor reads, request create/read/update/submit | any signed-in user (request visibility and DRAFT-only edits are enforced in the service, BR3) |
| `POST /auth/register`, `/audit`, `/settings/*` (webhook, approval threshold, per-user approval limits) | ADMIN |
| Vendor create/update/delete | PROCUREMENT, ADMIN |
| Request approve/reject | APPROVER, ADMIN |
| Purchase orders (all) | PROCUREMENT, ADMIN |
| `/platform/*` | platform key only (`x-platform-key`); tenant tokens are rejected |

Tenant isolation is a separate layer (Prisma extension, `tests/tenancy.test.js`): a valid role never grants access to another tenant's rows.

## Review results
| Check | Result | Action |
| --- | --- | --- |
| Passwords | bcrypt hashed | none |
| JWT | HS256 with `jti`, tenant claim, revocation list | Production now refuses to start with a `JWT_SECRET` shorter than 16 characters or containing "change-me"; same for `PLATFORM_API_KEY` |
| Platform key | compared with `timingSafeEqual`, routes disabled when unset | none |
| Login brute force | rate limited (20/min per address) | `TRUST_PROXY` added so the limit sees the real client behind nginx; compose sets it to 1 |
| CORS | was open to every origin | In production only origins in `CORS_ORIGINS` are allowed; the bundled client is same-origin so none are needed |
| Headers | helmet defaults, no `x-powered-by` | covered by `tests/hardening.test.js` |
| Input validation | zod on every body and query | none |
| Containers | non-root user, production dependencies only | none |
| Secrets in git | tree scanned for key patterns, none found; `.env` ignored | gitleaks added to CI to scan history on every run |
| nginx upstreams | resolved once at start, so a recreated API left the client returning 502 | nginx now re-resolves through Docker DNS |

## Dependency audit
- Client: `npm audit --omit=dev` reports 0 vulnerabilities.
- API: 3 high findings, all one chain: `prisma` CLI → `@prisma/config` → `deepmerge-ts` (stack exhaustion when merging recursive objects). It is reachable only in the Prisma CLI while it reads its config, never with request data, and the only fix offered is a Prisma 8 development build. **Accepted** until a stable release carries the fix; revisit at each release. CI fails on `critical` findings and reports the rest.

## Not covered
Invoicing, SSO and mobile are out of scope. Webhook targets are SSRF-guarded (private addresses refused unless `ALLOW_INSECURE_WEBHOOKS=1`, which must stay unset in production).
