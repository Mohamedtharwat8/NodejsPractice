require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

// Plain client on purpose: seeding sets tenantId explicitly and has no request context.
const prisma = new PrismaClient();

const tenants = [
  { name: 'Acme Corp', slug: 'acme' },
  { name: 'Globex Inc', slug: 'globex' },
];

const users = [
  ['Admin', 'admin@example.com', 'ADMIN'],
  ['Requester', 'requester@example.com', 'REQUESTER'],
  ['Approver', 'approver@example.com', 'APPROVER'],
  ['Procurement', 'procurement@example.com', 'PROCUREMENT'],
];

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  for (const t of tenants) {
    const tenant = await prisma.tenant.upsert({ where: { slug: t.slug }, update: {}, create: t });
    for (const [name, email, role] of users) {
      await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email } },
        update: {},
        create: { tenantId: tenant.id, name, email, role, passwordHash },
      });
    }
  }
  console.log(`Seeded tenants ${tenants.map((t) => t.slug).join(', ')} with users`, users.map((u) => u[1]).join(', '));
  console.log('Password for all: Password123!');
}

main().finally(() => prisma.$disconnect());
