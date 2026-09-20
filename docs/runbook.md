# Runbook

## Services and health
| Service | Port | Health | Depends on |
| --- | --- | --- | --- |
| api | 3000 | `GET /health` (reports redis, mongo and queue state but stays 200 without them) | postgres (required); redis and mongo are optional and degrade gracefully |
| ai-service | 4010 | `GET /health` | redis, mongo; an LLM key is optional (`local-fallback` provider without it) |
| notification-service | 4020 | `GET /health` | postgres, redis |
| client (nginx) | 8080 | `GET /` | api, ai-service |

Every request carries an `x-request-id`; quote it when reporting a problem and search the logs for it.

## Deploy and roll back
1. Tag `vX.Y.Z` on `main`. CI publishes the `api`, `ai-service`, `notification-service` and `client` images to GHCR.
2. Run the `migrate` image (`prisma migrate deploy`) before starting new API containers. Migrations are additive; never edit an applied one.
3. Roll back by starting the previous image tags. Roll back a migration only by shipping a new corrective migration.
4. Required production settings: a real `JWT_SECRET` and `PLATFORM_API_KEY` (16+ characters, no placeholders, or the API will not start), `CORS_ORIGINS` if a browser app on another origin calls the API, and `TRUST_PROXY` matching the number of proxies in front.

## Backup and restore
| Store | Holds | Backup | Restore |
| --- | --- | --- | --- |
| PostgreSQL | all business data, audit outbox, event outbox | `pg_dump -Fc -U postgres procurement > procurement.dump` nightly, plus WAL archiving if the recovery point must be under 24 h | `createdb procurement_restore`, `pg_restore -d procurement_restore procurement.dump`, check row counts, then repoint `DATABASE_URL` |
| MongoDB | audit trail (retention `AUDIT_RETENTION_DAYS`, 7 years by default) | `mongodump --uri "$MONGODB_URL" --archive=audit.gz --gzip` daily | `mongorestore --uri "$MONGODB_URL" --archive=audit.gz --gzip --drop` |
| Redis | cache, rate-limit counters, revocation list, job queue | none needed; it can be rebuilt | Start empty and let the cache refill. Revoked tokens are forgotten, so rotate `JWT_SECRET` if token theft is why you are restoring |

Compose example: `docker compose exec postgres pg_dump -Fc -U postgres procurement > procurement.dump`.
Test a restore into a scratch database every quarter; an untested backup is not a backup.
Audit events not yet drained to MongoDB wait in the Postgres outbox, so a Mongo restore does not lose them.

## Incidents
| Symptom | Check | Fix |
| --- | --- | --- |
| Client shows 502 | `docker compose ps`; is the api healthy? | Restart the failing service. nginx re-resolves addresses within 10 s |
| API refuses to start with a `JWT_SECRET` error | environment values | Set a real secret (see Deploy) |
| Everyone gets 401 after a deploy | `JWT_SECRET` changed | Restore the old secret, or have users sign in again |
| Users get 429 on login | shared address behind a proxy | Set `TRUST_PROXY` so the limit uses the client address |
| Notifications not arriving | notification-service health, Redis, `GET /api/v1/platform/dead-letters` (platform key) | Fix the cause, then `POST /platform/dead-letters/:id/retry` |
| Audit page empty or stale | api `/health` shows `mongo`; outbox rows piling up in Postgres | Restore Mongo; the drain worker catches up by itself |
| AI buttons fail | ai-service `/health` | The form still works without AI; check `AI_API_KEY` and `AI_MONTHLY_TOKEN_CAP` |
| Concurrent order creation returns 409 "Already exists" | should not happen since the numbering lock | Capture the request ids and report a bug |

## Useful commands
```
docker compose up --build                             start everything
docker compose run --rm migrate node prisma/seed.js   demo data (not for production)
npm test                                              backend suite (needs postgres, redis, mongo)
npm run load:flow                                     load test, see docs/load-test.md
```
