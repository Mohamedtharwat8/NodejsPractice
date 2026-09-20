const router = require('express').Router();
const { HttpError } = require('../../middleware/error');
const platformOnly = require('../../middleware/platformOnly');
const queues = require('../../infra/queue');
const redis = require('../../infra/redis');

router.use(platformOnly);

function requireQueue() {
  if (!queues.enabled() || !redis.ready()) throw new HttpError(503, 'Queue is unavailable', 'SERVICE_UNAVAILABLE');
}

const view = (job) => ({
  id: job.id, job: job.name, tenantId: job.data.original.tenantId, type: job.data.original.type,
  eventId: job.data.original.eventId, failedReason: job.data.failedReason, attemptsMade: job.data.attemptsMade,
  parkedAt: new Date(job.timestamp).toISOString(),
});

// Jobs that exhausted their retries (or can never succeed), newest first.
router.get('/', async (req, res) => {
  requireQueue();
  const jobs = await queues.queue('dead').getJobs(['waiting', 'delayed', 'failed', 'completed'], 0, 99);
  res.json({ data: jobs.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp).map(view) });
});

// Puts a parked job back on the main queue with a fresh retry budget, then removes it from the dead-letter queue.
router.post('/:id/retry', async (req, res) => {
  requireQueue();
  const dead = await queues.queue('dead').getJob(req.params.id);
  if (!dead) throw new HttpError(404, 'Not found');
  const { original, originalJobId } = dead.data;
  await queues.queue().add(dead.name, original, { jobId: `retry-${originalJobId}-${Date.now()}` });
  await dead.remove();
  res.status(202).json({ requeued: dead.name, eventId: original.eventId });
});

module.exports = router;
