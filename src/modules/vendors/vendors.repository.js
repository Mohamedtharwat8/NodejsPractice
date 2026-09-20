const prisma = require('../../db/prisma');

const list = ({ where, skip, take }) =>
  Promise.all([
    prisma.vendor.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
    prisma.vendor.count({ where }),
  ]);

const findById = (id) => prisma.vendor.findUniqueOrThrow({ where: { id } });
const create = (data) => prisma.vendor.create({ data });
const update = (id, data) => prisma.vendor.update({ where: { id }, data });

module.exports = { list, findById, create, update };
