const http = require("node:http");
const { startRelay } = require("../../src/modules/events/relay");
const { startWorker } = require("../../src/modules/events/worker");
const queues = require("../../src/infra/queue");

function createHealthServer() {
  return http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/ready") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "notification-service",
          ready: true,
        }),
      );
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ service: "notification-service", status: "ready" }),
    );
  });
}

function startNotificationService({
  port = Number(process.env.NOTIFICATION_SERVICE_PORT || 4020),
} = {}) {
  const server = createHealthServer();
  let stopRelay = () => {};
  let worker = null;

  if (queues.enabled()) {
    stopRelay = startRelay();
    worker = startWorker();
  } else {
    console.log(
      "notification-service: REDIS_URL is not configured; service disabled.",
    );
  }

  const runtime = {
    server,
    async stop() {
      stopRelay();
      if (worker && typeof worker.close === "function") await worker.close();
      if (queues.enabled()) await queues.close();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      console.log(`notification-service: listening on :${port}`);
      resolve(runtime);
    });
  });
}

if (require.main === module) {
  let running;
  startNotificationService().then((runtime) => {
    running = runtime;
    console.log("notification-service: relay and worker started");
  });

  async function shutdown(signal) {
    console.log(`notification-service: shutting down (${signal})`);
    await running?.stop();
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

module.exports = { startNotificationService, createHealthServer };
