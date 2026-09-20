# Procurement Portal client

Angular 22 app (standalone components, lazy-loaded feature areas, SCSS design tokens) for the procurement API.

## Run

```bash
npm install
npm start          # ng serve on :4200, proxies /api -> :3000 and /ai -> :4010
```

Start the API (`npm run dev` in the repo root) and, for the AI helper buttons, `npm run start:ai-service`.

## Structure

- `src/app/core`: API service, generated OpenAPI types, auth service/guards, HTTP interceptor, toasts, request store
- `src/app/features`: auth, dashboard, requests, approvals, vendors, orders, audit, admin, notifications
- `src/app/layout`: app shell

Routes are guarded by role (`roleGuard`), the interceptor adds the JWT and handles 401/error toasts, and the request form uses a reactive `FormArray` for line items.

## Tests

```bash
npm test           # Vitest unit tests
npm run build && npm run test:e2e   # Playwright smoke test against the production build (needs API + DB running)
```
