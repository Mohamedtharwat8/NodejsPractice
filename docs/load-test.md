# Load test of the main flow (phase 13)

`npm run load:flow` drives create request → submit → approve → issue purchase order over HTTP against a live stack, using the seeded `acme` users, and fails on any error or when a step's p95 exceeds 300 ms (the BRD budget).

```
docker compose up -d --wait
docker compose run --rm migrate node prisma/seed.js
npm run load:flow -- --flows=300 --concurrency=5
BASE_URL=http://localhost:8080 npm run load:flow      # through nginx
```

## Results (docker compose on a laptop, p95 ms)
| Step | 5 concurrent, direct | 5 concurrent, via nginx | 25 concurrent, direct |
| --- | ---: | ---: | ---: |
| create request | 25.7 | 31.9 | 115 |
| submit | 31.8 | 36.2 | 100 |
| approve | 35.3 | 42.3 | 174 |
| issue order | 40.8 | 45.6 | 472 |
| Failures | 0 | 0 | 0 |

## What it found
1. **PO numbering race (fixed).** The first run at 20 concurrent flows failed 247 of 300 order creations with `409 Already exists`. Numbers were `count + 1` inside the transaction, so concurrent issues chose the same number and hit the unique constraint. Fixed with a per-tenant, per-year `pg_advisory_xact_lock` taken before counting (`po.repository.js`). `tests/po-numbering.test.js` creates 12 orders at once and requires 12 distinct, consecutive numbers; it fails without the lock.
2. **nginx 502 after an API redeploy (fixed).** Recreating the API container left the client proxying to the old address. Upstreams are now re-resolved (`client/nginx.conf`).

## Known trade-off
Issuing orders is serialised per tenant so that BR7 numbers stay gap-free. At 25 simultaneous issues in one tenant the queue pushes that step to about 470 ms p95, over the 300 ms budget; at 5 it is 41 ms. A tenant issuing more than a few orders per second is well beyond the BRD's scale. If that changes, move numbering to a per-tenant counter row or a database sequence and accept gaps. Other tenants are unaffected because the lock is keyed by tenant.
