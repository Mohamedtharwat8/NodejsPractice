const prisma = require('../../db/prisma');
const { HttpError } = require('../../middleware/error');
const { paginate } = require('../../lib/pagination');

// What the API exposes; internal keys (tenant, user, event id, email bookkeeping) stay private.
const view = ({ id, type, title, entity, entityId, readAt, createdAt }) => ({ id, type, title, entity, entityId, readAt, createdAt });

// A user only ever sees their own notifications (tenant scoping is applied on top by the Prisma extension).
async function list(userId, { unread, page, pageSize, cursor }) {
  const where = { userId, ...(unread === 'true' && { readAt: null }), ...(unread === 'false' && { readAt: { not: null } }) };
  const result = await paginate({
    where, page, pageSize, cursor,
    fetch: ({ where: w, skip, take }) => prisma.notification.findMany({ where: w, skip, take, orderBy: { id: 'desc' } }),
    count: (w) => prisma.notification.count({ where: w }),
  });
  return { ...result, data: result.data.map(view) };
}

async function markRead(userId, id) {
  const found = await prisma.notification.findFirst({ where: { id, userId } });
  if (!found) throw new HttpError(404, 'Not found');
  if (found.readAt) return view(found);
  return view(await prisma.notification.update({ where: { id }, data: { readAt: new Date() } }));
}

async function markAllRead(userId) {
  const { count } = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { updated: count };
}

module.exports = { list, markRead, markAllRead };
