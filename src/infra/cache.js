const { client, ready } = require('./redis');
const { currentTenantId } = require('../db/tenantContext');

// Counters for tests and debugging. Set CACHE_DEBUG=1 to log every hit and miss.
// `by[name]` splits them per kind of entry ("vendor", "pr", "tenant"...), taken from the key.
const stats = { hits: 0, misses: 0, errors: 0, by: {} };
const debug = (msg) => process.env.CACHE_DEBUG && console.debug(`[cache] ${msg}`);

function record(kind, key) {
  const name = key.startsWith('t:') ? key.split(':')[2] : key.split(':')[0];
  const entry = (stats.by[name] ||= { hits: 0, misses: 0 });
  stats[kind]++;
  entry[kind]++;
  debug(`${kind === 'hits' ? 'HIT' : 'MISS'} ${key}`);
}

// Tenant-scoped key. Throws without a tenant context, so a cache entry can never be
// shared between tenants by accident (same rule as the Prisma extension).
function tenantKey(...parts) {
  const tenantId = currentTenantId();
  if (!tenantId) throw new Error('No tenant context for cache key');
  return `t:${tenantId}:${parts.join(':')}`;
}

// Every operation fails open: on any Redis problem the caller just sees a miss / no-op.
async function get(key) {
  if (!ready()) return undefined;
  try {
    const raw = await client.get(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    stats.errors++;
    return undefined;
  }
}

async function set(key, value, ttlSeconds) {
  if (!ready()) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    stats.errors++;
  }
}

async function del(...keys) {
  if (!ready() || !keys.length) return;
  try {
    await client.del(...keys);
  } catch {
    stats.errors++;
  }
}

// Read-through: return the cached value or load, store and return it. Null/undefined are not cached.
async function wrap(key, ttlSeconds, loader) {
  const cached = await get(key);
  if (cached !== undefined) {
    record('hits', key);
    return cached;
  }
  record('misses', key);
  const value = await loader();
  if (value !== undefined && value !== null) await set(key, value, ttlSeconds);
  return value;
}

// List caches embed a per-tenant version number; bumping it orphans every cached page at once
// (they expire by TTL) without scanning keys.
async function version(name) {
  const cached = await get(tenantKey('v', name));
  return cached ?? 0;
}

async function bump(name) {
  if (!ready()) return;
  try {
    await client.incr(tenantKey('v', name));
  } catch {
    stats.errors++;
  }
}

module.exports = { stats, tenantKey, get, set, del, wrap, version, bump };
