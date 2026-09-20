const Redis = require('ioredis');
const { redisUrl } = require('../config/env');

// Redis holds only data that can be lost or rebuilt (cache, rate-limit counters, revocation list).
// Every caller must therefore treat Redis as optional: check `ready()` and fail open on errors.
// Commands time out quickly so an unreachable Redis cannot stall requests.
const client = redisUrl
  ? new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    commandTimeout: 250,
    disconnectTimeout: 250, // how long disconnect() waits before destroying a stuck socket
    retryStrategy: (n) => Math.min(n * 200, 2000),
  })
  : null;

// Without a listener ioredis would throw on connection errors; `status()` reports them instead.
client?.on('error', () => {});

const ready = () => client?.status === 'ready';
const status = () => (!client ? 'disabled' : ready() ? 'up' : 'down');
const close = () => client?.disconnect();

module.exports = { client, ready, status, close };
