describe("Phase 9 background service boundary", () => {
  const originalLegacyFlag = process.env.ENABLE_LEGACY_NOTIFICATION_WORKER;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.ENABLE_LEGACY_NOTIFICATION_WORKER;
  });

  afterAll(() => {
    if (originalLegacyFlag === undefined)
      delete process.env.ENABLE_LEGACY_NOTIFICATION_WORKER;
    else process.env.ENABLE_LEGACY_NOTIFICATION_WORKER = originalLegacyFlag;
  });

  it("does not start the notification relay or worker by default", async () => {
    jest.doMock("../src/modules/audit/drain", () => ({
      startDrainWorker: jest.fn(() => () => {}),
    }));
    jest.doMock("../src/modules/events/relay", () => ({
      startRelay: jest.fn(() => () => {}),
    }));
    jest.doMock("../src/modules/events/worker", () => ({
      startWorker: jest.fn(() => ({ close: jest.fn().mockResolvedValue() })),
    }));
    jest.doMock("../src/infra/queue", () => ({
      enabled: jest.fn(() => true),
      close: jest.fn().mockResolvedValue(),
    }));

    const drain = require("../src/modules/audit/drain");
    const relay = require("../src/modules/events/relay");
    const worker = require("../src/modules/events/worker");
    const queue = require("../src/infra/queue");
    const { startBackground } = require("../src/background");

    const stop = startBackground();

    expect(drain.startDrainWorker).toHaveBeenCalledTimes(1);
    expect(relay.startRelay).not.toHaveBeenCalled();
    expect(worker.startWorker).not.toHaveBeenCalled();

    await stop();
    expect(queue.close).toHaveBeenCalledTimes(1);
  });

  it("re-enables the legacy notification worker when explicitly requested", async () => {
    process.env.ENABLE_LEGACY_NOTIFICATION_WORKER = "1";

    jest.doMock("../src/modules/audit/drain", () => ({
      startDrainWorker: jest.fn(() => () => {}),
    }));
    jest.doMock("../src/modules/events/relay", () => ({
      startRelay: jest.fn(() => () => {}),
    }));
    jest.doMock("../src/modules/events/worker", () => ({
      startWorker: jest.fn(() => ({ close: jest.fn().mockResolvedValue() })),
    }));
    jest.doMock("../src/infra/queue", () => ({
      enabled: jest.fn(() => true),
      close: jest.fn().mockResolvedValue(),
    }));

    const drain = require("../src/modules/audit/drain");
    const relay = require("../src/modules/events/relay");
    const worker = require("../src/modules/events/worker");
    const { startBackground } = require("../src/background");

    const stop = startBackground();

    expect(drain.startDrainWorker).toHaveBeenCalledTimes(1);
    expect(relay.startRelay).toHaveBeenCalledTimes(1);
    expect(worker.startWorker).toHaveBeenCalledTimes(1);

    await stop();
  });

  it("exposes a health and readiness endpoint for the notification service", async () => {
    const notificationService = require("../services/notification-service");

    const notificationRuntime =
      await notificationService.startNotificationService({
        port: 0,
      });

    const notificationPort = notificationRuntime.server.address().port;

    const notificationHealth = await fetch(
      `http://127.0.0.1:${notificationPort}/health`,
    );

    expect(notificationHealth.status).toBe(200);

    await notificationRuntime.stop();
  });
});
