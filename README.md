# Procurement Portal

REST API for a procure-to-pay flow: purchase requests, approvals and purchase orders. Express 5 + PostgreSQL + Prisma.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and `JWT_SECRET`.
3. `npm run db:migrate` (creates tables), then `npm run db:seed`.
4. `npm run dev` (or `npm start`), then `GET /health`.

Seeded users (password `Password123!`): `admin@`, `requester@`, `approver@`, `procurement@` `example.com`.

## Endpoints
| Method & path | Roles |
| --- | --- |
| `POST /auth/login` | public |
| `POST /auth/register` | ADMIN |
| `GET /auth/me` | any |
| `GET /vendors`, `GET /vendors/:id` | any |
| `POST /vendors`, `PATCH /vendors/:id`, `DELETE /vendors/:id` (deactivates) | PROCUREMENT, ADMIN |
| `POST /purchase-requests`, `GET /purchase-requests`, `GET /:id` | any (requesters see only their own) |
| `PATCH /purchase-requests/:id`, `POST /:id/submit` | owner, while DRAFT |
| `POST /purchase-requests/:id/approve`, `/reject` | APPROVER, ADMIN (not own request) |
| `POST /purchase-orders`, `GET /purchase-orders`, `GET /:id`, `POST /:id/cancel` | PROCUREMENT, ADMIN |

List endpoints accept `status`, `page`, `pageSize`.

## Tests
`npm test` runs against the database in `.env`; the seed must have been run.
