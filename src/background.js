const { startDrainWorker } = require("./modules/audit/drain");
const queues = require("./infra/queue");

// Phase 9 extracts the notification relay + worker into a dedicated service.
// The API keeps only its audit drain here; legacy local runs can re-enable the old behaviour
// by setting ENABLE_LEGACY_NOTIFICATION_WORKER=1 for a short transition period.
function startBackground() {
  const stops = [startDrainWorker()];

  let worker = null;
  let legacyNotificationMode =
    process.env.ENABLE_LEGACY_NOTIFICATION_WORKER === "1";

  if (legacyNotificationMode) {
    const { startRelay } = require("./modules/events/relay");
    const { startWorker } = require("./modules/events/worker");

    if (queues.enabled()) {
      stops.push(startRelay());
      worker = startWorker();
    }
  }

  return async function stop() {
    stops.forEach((s) => s());
    await worker?.close();
    await queues.close();
  };
}

module.exports = { startBackground };
