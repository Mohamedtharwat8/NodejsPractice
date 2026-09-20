const { Worker, UnrecoverableError } = require('bullmq');
const queues = require('../../infra/queue');
const { runWithRequest } = require('../../infra/requestContext');
const handlers = require('./handlers');

// Jobs that ran out of retries (or can never succeed) move to the dead-letter queue, where they wait for a
// person. Retrying one from there is `POST /platform/dead-letters/{id}/retry`.
async function parkInDeadLetter(job, err) {
  const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!exhausted && !(err instanceof UnrecoverableError)) return;
  await queues.queue('dead').add(job.name, {
    original: job.data, originalJobId: job.id, failedReason: err.message, attemptsMade: job.attemptsMade,
  }, { jobId: `dead-${job.id}`, attempts: 1, removeOnComplete: false });
}

// Runs jobs from the queue. Each runs with the event's correlation id in the request context, so logs and
// audit events made by the job carry the id of the request that caused the event.
// `lockDuration` / `stalledInterval` control how fast a job held by a dead worker is picked up again.
function startWorker({ concurrency = 5, lockDuration, stalledInterval } = {}) {
  const worker = new Worker(
    queues.NAMES.main,
    (job) => runWithRequest({ requestId: job.data.correlationId }, () => {
      const handler = handlers[job.name];
      if (!handler) throw new UnrecoverableError(`No handler for job ${job.name}`);
      return handler(job.data);
    }),
    {
      connection: queues.connectionOptions(),
      concurrency,
      ...(lockDuration && { lockDuration }),
      ...(stalledInterval && { stalledInterval }),
    },
  );
  worker.on('failed', (job, err) => { if (job) parkInDeadLetter(job, err).catch(() => {}); });
  worker.on('error', () => {}); // connection errors are retried by BullMQ; do not crash the process
  return worker;
}

module.exports = { startWorker };
