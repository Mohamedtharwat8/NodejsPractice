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

module.exports = { getWebhook, setWebhook };
