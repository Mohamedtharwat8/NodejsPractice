const { Queue } = require('bullmq');
const { redisUrl, jobAttempts, jobBackoffMs } = require('../config/env');
const redis = require('./redis');

// Job queues live in Redis (BullMQ). Producers never call these directly from a request: domain events
// go through the Postgres outbox first (modules/events), so a Redis outage cannot fail a business action.
const NAMES = { main: 'notifications', dead: 'notifications-dead' };

// BullMQ opens its own connections and needs `maxRetriesPerRequest: null` on worker connections.
function connectionOptions() {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

const enabled = () => Boolean(redisUrl);
const status = () => (!enabled() ? 'disabled' : redis.ready() ? 'up' : 'down');

const queues = {};
function queue(kind = 'main') {
  if (!enabled()) throw new Error('Queues need REDIS_URL');
  queues[kind] ||= new Queue(NAMES[kind], {
    connection: connectionOptions(),
    defaultJobOptions: {
      attempts: jobAttempts,
      backoff: { type: 'exponential', delay: jobBackoffMs },
      removeOnComplete: { age: 3600, count: 5000 },
      removeOnFail: false, // failed jobs stay inspectable until they are moved to the dead-letter queue
    },
  });
  return queues[kind];
}

async function close() {
  await Promise.all(Object.values(queues).map((q) => q.close().catch(() => {})));
  for (const key of Object.keys(queues)) delete queues[key];
}

module.exports = { NAMES, enabled, status, queue, connectionOptions, close };
