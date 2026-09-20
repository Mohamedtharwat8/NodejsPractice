const { startRelay } = require("../../src/modules/events/relay");
const { startWorker } = require("../../src/modules/events/worker");
const queues = require("../../src/infra/queue");

function startNotificationService() {
  if (!queues.enabled()) {
    console.log(
      "notification-service: REDIS_URL is not configured; service disabled.",
    );
    return () => {};
  }

  const stopRelay = startRelay();
  const worker = startWorker();

  const stop = async () => {
    stopRelay();
    await worker.close();
    await queues.close();
  };

  return stop;
}

const stopNotificationService = startNotificationService();

async function shutdown(signal) {
  console.log(`notification-service: shutting down (${signal})`);
  await stopNotificationService();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("notification-service: relay and worker started");
