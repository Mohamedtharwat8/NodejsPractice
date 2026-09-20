const repo = require('./vendors.repository');
const audit = require('../audit');

async function list({ status, page, pageSize }) {
  const where = status ? { status } : {};
  const [data, total] = await repo.list({ where, skip: (page - 1) * pageSize, take: pageSize });
  return { data, total, page, pageSize };
}

const get = (id) => repo.findById(id);

async function create(actorId, data) {
  const vendor = await repo.create(data);
  await audit(actorId, 'CREATE', 'Vendor', vendor.id);
  return vendor;
}

async function update(actorId, id, data) {
  const vendor = await repo.update(id, data);
  await audit(actorId, 'UPDATE', 'Vendor', id);
  return vendor;
}

// Vendors are deactivated, never deleted (BR8).
async function deactivate(actorId, id) {
  const vendor = await repo.update(id, { status: 'INACTIVE' });
  await audit(actorId, 'DEACTIVATE', 'Vendor', id);
  return vendor;
}

module.exports = { list, get, create, update, deactivate };
