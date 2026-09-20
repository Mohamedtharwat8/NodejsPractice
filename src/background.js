const { startDrainWorker } = require('./modules/audit/drain');
const { startRelay } = require('./modules/events/relay');
const { startWorker } = require('./modules/events/worker');
const queues = require('./infra/queue');

// Everything that runs beside the HTTP server: audit drain, event relay and the job worker.
// Phase 9 moves the worker into its own notification-service; the code stays the same.
function startBackground() {
  const stops = [startDrainWorker()];
  let worker = null;
  if (queues.enabled()) {
    stops.push(startRelay());
    worker = startWorker();
  }
  return async function stop() {
    stops.forEach((s) => s());
    await worker?.close();
    await queues.close();
  };
}

module.exports = { startBackground };
