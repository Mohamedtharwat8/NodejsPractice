// EXPLAIN (ANALYZE, BUFFERS) for the queries behind the heaviest list endpoints, on the load-test tenant.
//   npm run explain            summary per query
//   npm run explain -- --full  complete plans
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const full = process.argv.includes('--full');

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'loadtest' } });
  if (!tenant) throw new Error('loadtest tenant missing: run `npm run db:load`');
  const t = tenant.id;
  const req = await prisma.user.findFirst({ where: { tenantId: t, role: 'REQUESTER' }, orderBy: { id: 'asc' } });
  // A small tenant in a database dominated by the big one: the case where ordering by the primary key hurts.
  const small = await prisma.tenant.findUnique({ where: { slug: 'acme' } });
  const maxPr = (await prisma.purchaseRequest.aggregate({ where: { tenantId: t }, _max: { id: true } }))._max.id;

  // Same shape as the SQL Prisma generates for the list services (WHERE tenantId [AND ...] ORDER BY id DESC LIMIT n).
  const queries = [
    ['PR list, first page', `SELECT * FROM "PurchaseRequest" WHERE "tenantId" = ${t} ORDER BY id DESC LIMIT 20`],
    ['PR list, status=APPROVED', `SELECT * FROM "PurchaseRequest" WHERE "tenantId" = ${t} AND status = 'APPROVED' ORDER BY id DESC LIMIT 20`],
    ['PR list, offset 40k', `SELECT * FROM "PurchaseRequest" WHERE "tenantId" = ${t} ORDER BY id DESC LIMIT 20 OFFSET 40000`],
    ['PR count (list total)', `SELECT count(*) FROM "PurchaseRequest" WHERE "tenantId" = ${t}`],
    ['PR count, status=APPROVED', `SELECT count(*) FROM "PurchaseRequest" WHERE "tenantId" = ${t} AND status = 'APPROVED'`],
    ['PR list, requester own', `SELECT * FROM "PurchaseRequest" WHERE "tenantId" = ${t} AND "requesterId" = ${req.id} ORDER BY id DESC LIMIT 20`],
    ['PR list, cursor', `SELECT * FROM "PurchaseRequest" WHERE "tenantId" = ${t} AND id < ${maxPr - 40000} ORDER BY id DESC LIMIT 21`],
    ['PR list, cursor + status', `SELECT * FROM "PurchaseRequest" WHERE "tenantId" = ${t} AND status = 'APPROVED' AND id < ${maxPr - 40000} ORDER BY id DESC LIMIT 21`],
    ['PR list, SMALL tenant, first page', `SELECT * FROM "PurchaseRequest" WHERE "tenantId" = ${small.id} ORDER BY id DESC LIMIT 20`],
    ['PR list, SMALL tenant, status=DRAFT', `SELECT * FROM "PurchaseRequest" WHERE "tenantId" = ${small.id} AND status = 'DRAFT' ORDER BY id DESC LIMIT 20`],
    ['PO list, first page', `SELECT * FROM "PurchaseOrder" WHERE "tenantId" = ${t} ORDER BY id DESC LIMIT 20`],
    ['PO list, SMALL tenant, first page', `SELECT * FROM "PurchaseOrder" WHERE "tenantId" = ${small.id} ORDER BY id DESC LIMIT 20`],
    ['PO list, status=ISSUED offset 10k', `SELECT * FROM "PurchaseOrder" WHERE "tenantId" = ${t} AND status = 'ISSUED' ORDER BY id DESC LIMIT 20 OFFSET 10000`],
  ];

  for (const [name, sql] of queries) {
    const rows = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
    const lines = rows.map((r) => r['QUERY PLAN']);
    const time = lines.find((l) => l.startsWith('Execution Time'));
    console.log(`\n${name}\n  ${time}`);
    const shown = full ? lines : lines.filter((l) => /^\s*(->\s*)?(Limit|Sort|Aggregate|Finalize|Partial|Gather|(Parallel )?(Index|Bitmap|Seq)[^(]*)/.test(l)).slice(0, 5);
    for (const l of shown) console.log(`  ${l.replace(/\s+\(cost=[^)]*\)/, '').replace(/\(actual time=[^)]*\)/, '').trim()}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
