const crypto = require('node:crypto');
const net = require('node:net');
const { UnrecoverableError } = require('bullmq');
const { allowInsecureWebhooks } = require('../../config/env');

const TIMEOUT_MS = 5000;

// A tenant admin controls this URL and our servers will call it, so refuse targets that would let them
// probe our network: plain http, localhost and private or link-local IP addresses. This checks the
// hostname text only; it does not resolve DNS (a hostname pointing at a private address, or DNS
// rebinding, is not caught) so production should also restrict egress at the network level.
function isPrivateAddress(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(h)) return h === '::1' || h === '::' || /^f[cd]/.test(h) || h.startsWith('fe80');
  return false;
}

// Returns an error message, or null when the URL may be used.
function webhookUrlProblem(value) {
  let url;
  try { url = new URL(value); } catch { return 'Not a valid URL'; }
  if (allowInsecureWebhooks) return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'Only http(s) URLs';
  if (url.protocol !== 'https:') return 'Webhook URLs must use https';
  if (url.username || url.password) return 'Webhook URLs must not contain credentials';
  if (isPrivateAddress(url.hostname)) return 'Webhook URLs must not point at private or local addresses';
  return null;
}

const newSecret = () => `whsec_${crypto.randomBytes(24).toString('hex')}`;

// Signature scheme (documented for receivers): HMAC-SHA256 over `${timestamp}.${rawBody}` with the tenant secret,
// sent as X-Signature: sha256=<hex>. Receivers should reject old timestamps and dedupe on X-Event-Id.
const sign = (secret, timestamp, body) =>
  `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

// Delivers one event. Throws to make BullMQ retry (network errors, 5xx, 408, 429); throws
// UnrecoverableError for failures a retry cannot fix (bad URL, other 4xx, redirects), which go straight
// to the dead-letter queue.
async function deliver({ url, secret, eventId, type, occurredAt, payload, correlationId }) {
  const problem = webhookUrlProblem(url);
  if (problem) throw new UnrecoverableError(`Webhook URL rejected: ${problem}`);

  const body = JSON.stringify({ id: `evt_${eventId}`, type, occurredAt, data: payload });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'procurement-portal-webhooks/1',
    'x-event-id': `evt_${eventId}`,
    'x-event-type': type,
    'x-timestamp': timestamp,
    'x-signature': sign(secret, timestamp, body),
  };
  if (correlationId) headers['x-request-id'] = correlationId;

  const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.ok) return { status: res.status };
  const message = `Webhook responded ${res.status}`;
  const permanent = res.status < 500 && res.status !== 408 && res.status !== 429;
  throw permanent ? new UnrecoverableError(message) : new Error(message);
}

module.exports = { deliver, sign, newSecret, webhookUrlProblem };
