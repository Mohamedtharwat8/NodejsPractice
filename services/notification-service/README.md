# Notification service

This service hosts the background work that turns domain events into in-app notifications, email and webhooks.

It intentionally reuses the existing queue, relay and worker logic in the API code so the monolith can keep working while the service is extracted.

## Start

From the repo root:

```bash
npm run start:notification-service
```

## Responsibilities

- publish queued events from the Postgres outbox (`relay`)
- consume jobs from the BullMQ queue (`worker`)
- log correlation ids and telemetry from the request that caused the event
- maintain the same idempotency and dead-letter behaviour as the current implementation
