# AI service

This directory is the Phase 9 placeholder for the LLM-backed service that will eventually handle drafting, recommendations and spend summaries.

## Current status

The service is intentionally minimal so the repo can start isolating service boundaries without breaking the core API.

## Start

From the repo root:

```bash
npm run start:ai-service
```

## Planned responsibilities

- expose a versioned HTTP API for AI tasks
- handle prompt templates, retries and timeouts
- log request metadata and tenant context
- isolate LLM access from the API process
