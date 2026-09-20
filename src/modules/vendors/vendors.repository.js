const prisma = require('../../db/prisma');

const list = ({ where, skip, take }) =>
  Promise.all([
    prisma.vendor.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
    prisma.vendor.count({ where }),
  ]);

// Writes take an optional transaction client so the service can commit them with their audit event.
const findById = (id, db = prisma) => db.vendor.findUniqueOrThrow({ where: { id } });
const create = (data, db = prisma) => db.vendor.create({ data });
const update = (id, data, db = prisma) => db.vendor.update({ where: { id }, data });

module.exports = { list, findById, create, update };
