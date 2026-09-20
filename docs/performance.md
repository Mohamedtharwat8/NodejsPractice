# Query performance (phase 6)

Goal from the BRD: list endpoints under 300 ms p95 on a realistic data set. This documents what was measured, what was changed, and what was tried and rejected.

## How to reproduce
```
docker compose up -d --wait
npm run db:migrate && npm run db:seed
npm run db:load            # tenant "loadtest": 100,000 requests (200k items), ~30k purchase orders, 200 vendors
npm run explain            # EXPLAIN (ANALYZE, BUFFERS) for the queries behind the list endpoints
npm run bench              # p50/p95/max per endpoint, 150 calls each after warm-up
npm run db:load:clean      # remove the load tenant again
```
`bench` runs the app in-process against the local Docker Postgres and Redis, so figures are database plus application time without network. They are for comparing before and after on one machine, not absolute production numbers. The `acme` tenant (a few hundred rows) is used as the "small tenant in a busy database" case.

## Results (p95, milliseconds)

| Scenario | Before | After |
| --- | ---: | ---: |
| Requests, first page (offset, with total) | 17.7 | 14.1 |
| Requests, `status=APPROVED` | 18.7 | 9.5 |
| Requests, page 2000 (offset 40,000) | 26.0 | 18.2 |
| Requests, requester's own list | 13.5 | 4.4 |
| Requests, small tenant | 26.7 | 8.7 |
| Requests, small tenant, `status=DRAFT` | 16.8 | 7.1 |
| Purchase orders, first page | 17.7 | 7.6 |
| Purchase orders, `status=ISSUED` page 500 | 19.9 | 10.0 |
| Purchase orders, small tenant | 17.1 | 7.8 |
| Requests, cursor 40,000 rows deep | n/a (no cursor yet) | 9.2 |
| Requests, cursor + `status=APPROVED` | n/a | 8.5 |

Every scenario is far below 300 ms both before and after; at 100,000 rows the target was never at risk. The value of the work is removing the costs that grow with data size, so the endpoints stay flat at 10x and 100x.

## What the plans showed

| Finding | Before | After |
| --- | --- | --- |
| Loading a page of requests read `PRItem` by `prId` with **no index** (Postgres does not index foreign keys) | Parallel Seq Scan over 200k rows, 12.5 ms per page | Index scan; list latency roughly halved |
| Requester's own list (`tenantId`, `requesterId`, order by `id`) | Seq Scan + Sort, 5.7 ms | Index Scan Backward on `(tenantId, requesterId, id)`, 0.04 ms |
| Lists ordered by `id` but the composite indexes ended in `createdAt` / `issuedAt` | Small tenants read all their rows then sorted them | Indexes end in `id`, so the order comes straight from the index |
| `OFFSET 40000` | 5 ms, grows linearly with the page number | Cursor mode: cost independent of depth |
| `COUNT(*)` for `total` | 10 ms Seq Scan on the whole tenant, grows linearly | Not computed in cursor mode |

## Changes
- **Indexes** (migrations `list_indexes`, `pritem_prid_index`): `PurchaseRequest (tenantId,id)`, `(tenantId,status,id)`, `(tenantId,requesterId,id)`; `PurchaseOrder (tenantId,id)`, `(tenantId,status,id)`; `PRItem (prId)`. The two indexes ending in `createdAt` / `issuedAt` were dropped because no query used them.
- **Cursor pagination** on `GET /purchase-requests` and `GET /purchase-orders`: pass `cursor` (opaque, returned as `nextCursor`). It is additive within v1: `page`/`pageSize` still work and now also return `nextCursor`. Cursor responses omit `total` and `page` on purpose, since counting is the expensive part. A request created between two page fetches never shifts or repeats rows (tested).
- Code: [src/lib/pagination.js](../src/lib/pagination.js).

## N+1 review
List endpoints load `items`, `approval` and `order` with Prisma's default strategy: one extra query per relation for the whole page using an `IN` list, never one per row (five statements per request page in total). Nothing to fix apart from the missing `PRItem` index above.

## Tried and rejected
Prisma's `relationLoadStrategy: 'join'` (preview feature `relationJoins`) would load a page in one statement. On the 100,000-row data set a list query ran for over 50 seconds and stalled the benchmark, so it was reverted and the preview flag removed. The cause was not investigated further (the likely explanation is the planner joining the relations before applying `LIMIT`); if this is revisited, run `EXPLAIN` on the generated SQL first.

## Known limits and follow-ups
- Purchase order numbers are generated with `COUNT(*)` over the tenant's orders for the year, then `+ 1`. That is O(n) per order and two concurrent creations can pick the same number (the unique constraint turns the loser into a 409). A per-tenant-per-year counter row updated with `UPDATE ... RETURNING` would fix both. Not done in this phase.
- Offset mode still runs `COUNT(*)` on every call. Clients that page deep or through large tenants should use cursors.
- Statistics: after a bulk load run `ANALYZE` (the loader does), otherwise the planner misjudges the tables.
