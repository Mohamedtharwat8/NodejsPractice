// Generates a realistic data set for query-performance work, in its own tenant ("loadtest")
// so it never mixes with the tenants the test suite uses.
//
//   npm run db:load                 100,000 purchase requests (default)
//   npm run db:load -- --requests=20000
//   npm run db:load:clean           remove everything the loader created
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

// Plain client on purpose: bulk SQL with an explicit tenantId, no request context.
const prisma = new PrismaClient();

const SLUG = 'loadtest';
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

async function clean() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) return null;
  const t = tenant.id;
  // Children first; every statement is scoped to the load tenant.
  await prisma.$executeRaw`DELETE FROM "PurchaseOrder" WHERE "tenantId" = ${t}`;
  await prisma.$executeRaw`DELETE FROM "Approval" WHERE "prId" IN (SELECT id FROM "PurchaseRequest" WHERE "tenantId" = ${t})`;
  await prisma.$executeRaw`DELETE FROM "PRItem" WHERE "prId" IN (SELECT id FROM "PurchaseRequest" WHERE "tenantId" = ${t})`;
  await prisma.$executeRaw`DELETE FROM "PurchaseRequest" WHERE "tenantId" = ${t}`;
  await prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "tenantId" = ${t}`;
  await prisma.$executeRaw`DELETE FROM "Vendor" WHERE "tenantId" = ${t}`;
  await prisma.$executeRaw`DELETE FROM "User" WHERE "tenantId" = ${t}`;
  await prisma.tenant.delete({ where: { id: t } });
  return t;
}

async function load(requests) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const tenant = await prisma.tenant.create({ data: { name: 'Load Test Inc', slug: SLUG } });
  const t = tenant.id;

  const people = [
    ['Admin', 'admin@load.test', 'ADMIN'],
    ['Procurement', 'procurement@load.test', 'PROCUREMENT'],
    ...Array.from({ length: 5 }, (_, i) => [`Approver ${i + 1}`, `approver${i + 1}@load.test`, 'APPROVER']),
    ...Array.from({ length: 50 }, (_, i) => [`Requester ${i + 1}`, `requester${i + 1}@load.test`, 'REQUESTER']),
  ];
  await prisma.user.createMany({
    data: people.map(([name, email, role]) => ({ tenantId: t, name, email, role, passwordHash })),
  });
  await prisma.$executeRaw`
    INSERT INTO "Vendor" ("tenantId", "name", "email", "status")
    SELECT ${t}, 'Vendor ' || g, 'vendor' || g || '@load.test',
           CASE WHEN g % 10 = 0 THEN 'INACTIVE'::"VendorStatus" ELSE 'ACTIVE'::"VendorStatus" END
    FROM generate_series(1, 200) g`;

  // Requests: ids ascend with createdAt (one every 10 minutes), status mix ~15% draft, 20% submitted, 50% approved, 15% rejected.
  await prisma.$executeRaw`
    WITH requesters AS (SELECT array_agg(id) AS ids FROM "User" WHERE "tenantId" = ${t} AND role = 'REQUESTER'),
    pr AS (
      INSERT INTO "PurchaseRequest" ("tenantId", "requesterId", "title", "justification", "status", "totalAmount", "createdAt", "updatedAt")
      SELECT ${t},
             (SELECT ids[1 + floor(random() * array_length(ids, 1))::int] FROM requesters),
             'LOAD request ' || g, 'Generated for performance testing',
             CASE WHEN r < 0.15 THEN 'DRAFT' WHEN r < 0.35 THEN 'SUBMITTED' WHEN r < 0.85 THEN 'APPROVED' ELSE 'REJECTED' END::"PRStatus",
             round((random() * 5000 + 10)::numeric, 2),
             now() - ((${requests} - g) * interval '10 minutes'),
             now() - ((${requests} - g) * interval '10 minutes')
      FROM (SELECT g, random() AS r FROM generate_series(1, ${requests}) g) s
      RETURNING id, "totalAmount"
    )
    INSERT INTO "PRItem" ("prId", "description", "quantity", "unitPrice")
    SELECT id, 'Item ' || n, n, round("totalAmount" / (n + 1), 2) FROM pr, generate_series(1, 2) n`;

  await prisma.$executeRaw`
    INSERT INTO "Approval" ("prId", "approverId", "decision", "decidedAt")
    SELECT p.id, (SELECT id FROM "User" WHERE "tenantId" = ${t} AND role = 'APPROVER' ORDER BY id OFFSET (p.id % 5) LIMIT 1),
           p.status::text::"Decision", p."updatedAt"
    FROM "PurchaseRequest" p WHERE p."tenantId" = ${t} AND p.status IN ('APPROVED', 'REJECTED')`;

  // A purchase order for 60% of approved requests, numbered per year like the app does.
  await prisma.$executeRaw`
    INSERT INTO "PurchaseOrder" ("tenantId", "prId", "vendorId", "poNumber", "status", "issuedAt")
    SELECT ${t}, s.id, (SELECT id FROM "Vendor" WHERE "tenantId" = ${t} AND status = 'ACTIVE' ORDER BY id OFFSET (s.id % 180) LIMIT 1),
           'PO-' || s.yr || '-' || repeat('0', greatest(4 - length(s.n::text), 0)) || s.n,
           CASE WHEN s.id % 20 = 0 THEN 'CANCELLED' ELSE 'ISSUED' END::"POStatus",
           s."updatedAt"
    FROM (
      SELECT id, "updatedAt", extract(year FROM "updatedAt")::int AS yr,
             row_number() OVER (PARTITION BY extract(year FROM "updatedAt") ORDER BY id) AS n
      FROM "PurchaseRequest" WHERE "tenantId" = ${t} AND status = 'APPROVED' AND id % 5 < 3
    ) s`;

  await prisma.$executeRawUnsafe('ANALYZE "PurchaseRequest", "PRItem", "Approval", "PurchaseOrder", "Vendor", "User"');
  return t;
}

async function main() {
  const cleaning = process.argv.includes('--clean');
  const removed = await clean();
  if (removed) console.log(`Removed previous load data (tenant ${removed}).`);
  if (cleaning) return;

  const requests = arg('requests', 100000);
  const started = Date.now();
  await load(requests);
  const counts = await prisma.$queryRaw`
    SELECT (SELECT count(*) FROM "PurchaseRequest" WHERE "tenantId" = t.id)::int AS requests,
           (SELECT count(*) FROM "PurchaseOrder" WHERE "tenantId" = t.id)::int AS orders,
           (SELECT count(*) FROM "Vendor" WHERE "tenantId" = t.id)::int AS vendors
    FROM "Tenant" t WHERE t.slug = ${SLUG}`;
  console.log(`Loaded tenant "${SLUG}" in ${((Date.now() - started) / 1000).toFixed(1)}s:`, counts[0]);
  console.log('Log in with {"tenant":"loadtest","email":"admin@load.test","password":"Password123!"}');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
