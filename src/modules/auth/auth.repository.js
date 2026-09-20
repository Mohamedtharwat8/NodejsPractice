const prisma = require('../../db/prisma');

// User queries are tenant-scoped by the Prisma extension, so these run inside a tenant context.
const findByEmail = (email) => prisma.user.findFirst({ where: { email } });
const findById = (id) => prisma.user.findFirst({ where: { id } });
const create = (data) => prisma.user.create({ data });

// Tenant is a global table, looked up before any tenant context exists.
const findTenantBySlug = (slug) => prisma.tenant.findUnique({ where: { slug } });

module.exports = { findByEmail, findById, create, findTenantBySlug };
