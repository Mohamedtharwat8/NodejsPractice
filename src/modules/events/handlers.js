const prisma = require('../../db/prisma');
const { runInTenant } = require('../../db/tenantContext');
const email = require('./email');
const webhook = require('./webhook');

// Who is told about what. Runs inside the event's tenant context, so every query is tenant-scoped.
async function recipients(type, p) {
  switch (type) {
    case 'REQUEST_SUBMITTED': {
      const approvers = await prisma.user.findMany({
        where: { role: { in: ['APPROVER', 'ADMIN'] }, NOT: { id: p.requesterId } },
        select: { id: true },
      });
      return approvers.map((u) => ({
        userId: u.id, entity: 'PurchaseRequest', entityId: p.prId, title: `Approval needed: "${p.title}"`,
      }));
    }
    case 'REQUEST_DECIDED':
      return [{
        userId: p.requesterId, entity: 'PurchaseRequest', entityId: p.prId,
        title: `Your request "${p.title}" was ${p.decision === 'APPROVED' ? 'approved' : 'rejected'}`,
      }];
    case 'PO_ISSUED':
      return [{
        userId: p.requesterId, entity: 'PurchaseOrder', entityId: p.poId,
        title: `Purchase order ${p.poNumber} was issued for "${p.title}"`,
      }];
    default:
      return [];
  }
}

// In-app notifications, then email. Safe to run more than once for the same event:
// - the unique (userId, eventId, type) key means a rerun creates no second notification, and
// - `emailedAt` is set right after each send, so a rerun only emails whoever is still unmailed.
// Email is at-least-once: a crash between sending and setting emailedAt can send that one message twice.
async function notify({ eventId, tenantId, type, payload }) {
  return runInTenant(tenantId, async () => {
    const list = await recipients(type, payload);
    if (list.length) {
      await prisma.notification.createMany({
        data: list.map((r) => ({ ...r, eventId, type })),
        skipDuplicates: true,
      });
    }
    const unsent = await prisma.notification.findMany({
      where: { eventId, type, emailedAt: null },
      include: { user: { select: { email: true } } },
    });
    for (const n of unsent) {
      await email.send({ to: n.user.email, subject: n.title, text: `${n.title}\n\nOpen the procurement portal to see the details.` });
      await prisma.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
    }
    return { notified: list.length, emailed: unsent.length };
  });
}

// Calls the tenant's webhook, if it configured one.
async function callWebhook({ eventId, tenantId, type, payload, correlationId, occurredAt }) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { webhookUrl: true, webhookSecret: true } });
  if (!tenant?.webhookUrl || !tenant.webhookSecret) return { skipped: 'no webhook configured' };
  return webhook.deliver({ url: tenant.webhookUrl, secret: tenant.webhookSecret, eventId, type, occurredAt, payload, correlationId });
}

module.exports = { notify, webhook: callWebhook };
