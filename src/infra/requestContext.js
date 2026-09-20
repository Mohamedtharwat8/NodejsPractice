const { AsyncLocalStorage } = require('node:async_hooks');

// Per-request data that is not tenant-related: currently the request id used to correlate log lines
// and audit events (and, later, queue jobs and calls to other services).
const storage = new AsyncLocalStorage();

const runWithRequest = (store, fn) => storage.run(store, fn);
const currentRequestId = () => storage.getStore()?.requestId;

module.exports = { runWithRequest, currentRequestId };
