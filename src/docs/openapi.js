const { z } = require('zod');
const auth = require('../modules/auth/auth.schema');
const vendors = require('../modules/vendors/vendors.schema');
const pr = require('../modules/purchase-requests/pr.schema');
const po = require('../modules/purchase-orders/po.schema');
const tenants = require('../modules/tenants/tenants.schema');

// Request bodies and query strings come straight from the zod schemas the routes validate with,
// so the documented input can never drift from the enforced input.
const inputSchema = ({ $schema, ...rest }) => rest;
const toJson = (schema) => inputSchema(z.toJSONSchema(schema, { io: 'input' }));

const queryParams = (schema) => {
  const { properties = {}, required = [] } = toJson(schema);
  return Object.entries(properties).map(([name, s]) => ({
    name, in: 'query', required: required.includes(name), schema: s,
  }));
};

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const page = (name) => ({
  type: 'object',
  properties: {
    data: { type: 'array', items: ref(name) },
    total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' },
  },
});
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };

const components = {
  securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token from POST /auth/login.' },
    platformKey: { type: 'apiKey', in: 'header', name: 'x-platform-key', description: 'Platform-owner secret (PLATFORM_API_KEY).' },
  },
  schemas: {
    Error: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: {
              type: 'string',
              enum: [
                'VALIDATION_ERROR', 'INVALID_JSON', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT',
                'RATE_LIMITED', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE',
              ],
            },
            message: { type: 'string' },
            details: { description: 'Validation issues (VALIDATION_ERROR only).', type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
    User: {
      type: 'object',
      properties: {
        id: { type: 'integer' }, tenantId: { type: 'integer' }, name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        role: { enum: ['REQUESTER', 'APPROVER', 'PROCUREMENT', 'ADMIN'] },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    LoginResponse: { type: 'object', properties: { token: { type: 'string' }, user: ref('User') } },
    Tenant: {
      type: 'object',
      properties: {
        id: { type: 'integer' }, name: { type: 'string' }, slug: { type: 'string' },
        status: { enum: ['ACTIVE', 'SUSPENDED'] },
      },
    },
    TenantCreated: { type: 'object', properties: { tenant: ref('Tenant'), admin: ref('User') } },
    Vendor: {
      type: 'object',
      properties: {
        id: { type: 'integer' }, name: { type: 'string' }, email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] }, status: { enum: ['ACTIVE', 'INACTIVE'] },
      },
    },
    PRItem: {
      type: 'object',
      properties: {
        id: { type: 'integer' }, description: { type: 'string' }, quantity: { type: 'integer' },
        unitPrice: { type: 'string', description: 'Decimal, serialised as a string.' },
      },
    },
    Approval: {
      type: 'object',
      properties: {
        decision: { enum: ['APPROVED', 'REJECTED'] }, comment: { type: ['string', 'null'] },
        approverId: { type: 'integer' }, decidedAt: { type: 'string', format: 'date-time' },
      },
    },
    PurchaseRequest: {
      type: 'object',
      properties: {
        id: { type: 'integer' }, requesterId: { type: 'integer' }, title: { type: 'string' },
        justification: { type: ['string', 'null'] },
        status: { enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] },
        totalAmount: { type: 'string', description: 'Decimal, serialised as a string.' },
        items: { type: 'array', items: ref('PRItem') },
        approval: { oneOf: [ref('Approval'), { type: 'null' }] },
      },
    },
    PurchaseOrder: {
      type: 'object',
      properties: {
        id: { type: 'integer' }, prId: { type: 'integer' }, vendorId: { type: 'integer' },
        poNumber: { type: 'string', example: 'PO-2026-0001' }, status: { enum: ['ISSUED', 'CANCELLED'] },
        issuedAt: { type: 'string', format: 'date-time' },
      },
    },
    VendorPage: page('Vendor'),
    PurchaseRequestPage: page('PurchaseRequest'),
    PurchaseOrderPage: page('PurchaseOrder'),
  },
};

// One entry per endpoint. `roles` is documentation; enforcement lives in the routers.
const operations = [
  { method: 'post', path: '/platform/tenants', tag: 'Platform', summary: 'Create a tenant with its first admin',
    security: 'platformKey', body: tenants.create, ok: [201, 'TenantCreated'], errors: [400, 401, 409] },

  { method: 'patch', path: '/platform/tenants/{id}/status', tag: 'Platform',
    summary: 'Suspend or reactivate a tenant (blocks logins and API calls)', security: 'platformKey',
    body: tenants.setStatus, ok: [200, 'Tenant'], errors: [400, 401, 404] },

  { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Log in to a tenant (rate limited per IP)',
    security: null, body: auth.login, ok: [200, 'LoginResponse'], errors: [400, 401, 403, 429] },
  { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Revoke the current token',
    description: 'Needs Redis; answers 503 if the revocation cannot be recorded.',
    ok: [204, null], errors: [401, 503] },
  { method: 'post', path: '/auth/register', tag: 'Auth', summary: 'Create a user in your own tenant',
    roles: ['ADMIN'], body: auth.register, ok: [201, 'User'], errors: [400, 401, 403, 409] },
  { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Current user', ok: [200, 'User'], errors: [401] },

  { method: 'get', path: '/vendors', tag: 'Vendors', summary: 'List vendors', query: vendors.list,
    ok: [200, 'VendorPage'], errors: [400, 401] },
  { method: 'post', path: '/vendors', tag: 'Vendors', summary: 'Create a vendor', roles: ['PROCUREMENT', 'ADMIN'],
    body: vendors.create, ok: [201, 'Vendor'], errors: [400, 401, 403] },
  { method: 'get', path: '/vendors/{id}', tag: 'Vendors', summary: 'Get a vendor', ok: [200, 'Vendor'], errors: [401, 404] },
  { method: 'patch', path: '/vendors/{id}', tag: 'Vendors', summary: 'Update a vendor', roles: ['PROCUREMENT', 'ADMIN'],
    body: vendors.update, ok: [200, 'Vendor'], errors: [400, 401, 403, 404] },
  { method: 'delete', path: '/vendors/{id}', tag: 'Vendors', summary: 'Deactivate a vendor (never deleted)',
    roles: ['PROCUREMENT', 'ADMIN'], ok: [200, 'Vendor'], errors: [401, 403, 404] },

  { method: 'post', path: '/purchase-requests', tag: 'Purchase requests', summary: 'Create a draft request',
    body: pr.create, ok: [201, 'PurchaseRequest'], errors: [400, 401] },
  { method: 'get', path: '/purchase-requests', tag: 'Purchase requests',
    summary: 'List requests (requesters see only their own)', query: pr.list,
    ok: [200, 'PurchaseRequestPage'], errors: [400, 401] },
  { method: 'get', path: '/purchase-requests/{id}', tag: 'Purchase requests', summary: 'Get a request',
    ok: [200, 'PurchaseRequest'], errors: [401, 404] },
  { method: 'patch', path: '/purchase-requests/{id}', tag: 'Purchase requests',
    summary: 'Edit a request (owner, DRAFT only)', body: pr.update,
    ok: [200, 'PurchaseRequest'], errors: [400, 401, 403, 404, 409] },
  { method: 'post', path: '/purchase-requests/{id}/submit', tag: 'Purchase requests',
    summary: 'Submit a draft for approval (owner)', ok: [200, 'PurchaseRequest'], errors: [401, 403, 404, 409] },
  { method: 'post', path: '/purchase-requests/{id}/approve', tag: 'Purchase requests',
    summary: 'Approve a submitted request (not your own)', roles: ['APPROVER', 'ADMIN'], body: pr.decision,
    ok: [200, 'PurchaseRequest'], errors: [400, 401, 403, 404, 409] },
  { method: 'post', path: '/purchase-requests/{id}/reject', tag: 'Purchase requests',
    summary: 'Reject a submitted request (not your own)', roles: ['APPROVER', 'ADMIN'], body: pr.decision,
    ok: [200, 'PurchaseRequest'], errors: [400, 401, 403, 404, 409] },

  { method: 'post', path: '/purchase-orders', tag: 'Purchase orders',
    summary: 'Create a PO from an approved request and an active vendor', roles: ['PROCUREMENT', 'ADMIN'],
    body: po.create, ok: [201, 'PurchaseOrder'], errors: [400, 401, 403, 404, 409] },
  { method: 'get', path: '/purchase-orders', tag: 'Purchase orders', summary: 'List purchase orders',
    roles: ['PROCUREMENT', 'ADMIN'], query: po.list, ok: [200, 'PurchaseOrderPage'], errors: [400, 401, 403] },
  { method: 'get', path: '/purchase-orders/{id}', tag: 'Purchase orders', summary: 'Get a purchase order',
    roles: ['PROCUREMENT', 'ADMIN'], ok: [200, 'PurchaseOrder'], errors: [401, 403, 404] },
  { method: 'post', path: '/purchase-orders/{id}/cancel', tag: 'Purchase orders', summary: 'Cancel an issued order',
    roles: ['PROCUREMENT', 'ADMIN'], ok: [200, 'PurchaseOrder'], errors: [401, 403, 409] },
];

const ERROR_TEXT = {
  400: 'Validation failed', 401: 'Missing or invalid credentials', 403: 'Role not allowed',
  404: 'Not found (also returned for another tenant\'s records)', 409: 'Invalid state for this action',
  429: 'Too many requests', 503: 'Temporary dependency outage',
};

function buildOperation(op) {
  const [okStatus, okSchema] = op.ok;
  const parameters = [
    ...(op.path.includes('{id}') ? [idParam] : []),
    ...(op.query ? queryParams(op.query) : []),
  ];
  const description = [op.description, op.roles && `Allowed roles: ${op.roles.join(', ')}.`]
    .filter(Boolean).join(' ') || undefined;
  const security = op.security === null ? [] : [{ [op.security || 'bearerAuth']: [] }];

  return {
    tags: [op.tag],
    summary: op.summary,
    ...(description && { description }),
    security,
    ...(parameters.length && { parameters }),
    ...(op.body && { requestBody: { required: true, content: { 'application/json': { schema: toJson(op.body) } } } }),
    responses: {
      [okStatus]: okSchema
        ? { description: 'Success', content: { 'application/json': { schema: ref(okSchema) } } }
        : { description: 'Success, no content' },
      ...Object.fromEntries(op.errors.map((s) => [s, {
        description: ERROR_TEXT[s], content: { 'application/json': { schema: ref('Error') } },
      }])),
    },
  };
}

function buildSpec() {
  const paths = {};
  for (const op of operations) {
    (paths[op.path] ||= {})[op.method] = buildOperation(op);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Procurement Portal API',
      version: '1.0.0',
      description:
        'Multi-tenant procure-to-pay API. Log in with a tenant slug to get a JWT; every record is scoped to that tenant.\n\n' +
        'Versioning: the version is in the path (`/api/v1`). Deprecated versions answer with `Deprecation`, `Sunset` and `Link` headers ' +
        'and keep working for at least six months. Errors always look like `{ "error": { "code", "message", "details"? } }`.',
    },
    servers: [{ url: '/api/v1' }],
    tags: [...new Set(operations.map((o) => o.tag))].map((name) => ({ name })),
    paths,
    components,
  };
}

module.exports = { buildSpec, operations };
