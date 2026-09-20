const prisma = require('../../db/prisma');
const { HttpError } = require('../../middleware/error');
const audit = require('../audit');
const { webhookUrlProblem, newSecret } = require('../events/webhook');

const view = (t) => ({ url: t.webhookUrl, hasSecret: Boolean(t.webhookSecret) });

async function getWebhook(tenantId) {
  return view(await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }));
}

// The secret is returned once, when it is generated, and never readable again (only rotatable).
async function setWebhook(user, { url, rotateSecret }) {
  if (url) {
    const problem = webhookUrlProblem(url);
    if (problem) throw new HttpError(400, problem, 'VALIDATION_ERROR');
  }
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
  const secret = url && (!tenant.webhookSecret || rotateSecret) ? newSecret() : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.update({
      where: { id: user.tenantId },
      data: url
        ? { webhookUrl: url, ...(secret && { webhookSecret: secret }) }
        : { webhookUrl: null, webhookSecret: null },
    });
    await audit(Number(user.id), 'SET_WEBHOOK', 'Tenant', user.tenantId, tx, {
      before: { url: tenant.webhookUrl }, after: { url: t.webhookUrl, secretRotated: Boolean(secret) }, // never the secret
    });
    return t;
  });
  return { ...view(updated), ...(secret && { secret }) };
}

const num = (d) => (d === null ? null : Number(d));

async function getApproval(tenantId) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  return { threshold: num(tenant.approvalThreshold) };
}

// BR9: the amount above which a request needs an approver with a sufficient limit. Null turns the rule off.
async function setApproval(user, { threshold }) {
  const before = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.update({ where: { id: user.tenantId }, data: { approvalThreshold: threshold } });
    await audit(Number(user.id), 'SET_APPROVAL_THRESHOLD', 'Tenant', user.tenantId, tx, {
      before: { threshold: num(before.approvalThreshold) }, after: { threshold: num(t.approvalThreshold) },
    });
    return t;
  });
  return { threshold: num(updated.approvalThreshold) };
}

async function setUserLimit(actor, userId, { approvalLimit }) {
  const before = await prisma.user.findUnique({ where: { id: userId } }); // tenant-scoped: other tenants' users are not found
  if (!before) throw new HttpError(404, 'User not found');
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: userId }, data: { approvalLimit } });
    await audit(Number(actor.id), 'SET_APPROVAL_LIMIT', 'User', userId, tx, {
      before: { approvalLimit: num(before.approvalLimit) }, after: { approvalLimit: num(u.approvalLimit) },
    });
    return u;
  });
  return { id: updated.id, approvalLimit: num(updated.approvalLimit) };
}

module.exports = { getWebhook, setWebhook, getApproval, setApproval, setUserLimit };
