require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const users = [
  ['Admin', 'admin@example.com', 'ADMIN'],
  ['Requester', 'requester@example.com', 'REQUESTER'],
  ['Approver', 'approver@example.com', 'APPROVER'],
  ['Procurement', 'procurement@example.com', 'PROCUREMENT'],
];

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  for (const [name, email, role] of users) {
    await prisma.user.upsert({ where: { email }, update: {}, create: { name, email, role, passwordHash } });
  }
  console.log('Seeded users (password: Password123!):', users.map((u) => u[1]).join(', '));
}

main().finally(() => prisma.$disconnect());
