# AI service

This is the independently runnable LLM boundary for procurement assistance.

It exposes signed, tenant-scoped endpoints for justification drafting, vendor recommendations, and spend summaries. The runtime validates shared contracts, versions prompts, retries with a timeout, checks a monthly tenant cap, validates model output, and records interaction metadata. With no provider key it uses a deterministic local fallback so core development remains available.

## Start

From the repo root:

```bash
npm run start:ai-service
```

## Endpoints

- `GET /health`, `GET /ready`
- `POST /draft-justification`
- `POST /vendor-recommendation`
- `POST /spend-summary`
- `POST /interactions/:id/accept`

All POST endpoints require `Authorization: Bearer <signed-token>` outside the test environment. The token must carry a tenant id (`tid`).
