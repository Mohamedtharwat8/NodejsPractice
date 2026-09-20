const mongoose = require('mongoose');
const { mongodbUrl } = require('../config/env');

// MongoDB is the audit store. Business requests never wait for it: events go through the Postgres
// outbox (modules/audit/drain.js), so an unreachable Mongo only delays the audit trail.
mongoose.set('bufferCommands', false); // fail fast when disconnected instead of queueing for 10s

let connecting = null;

function connect() {
  if (!mongodbUrl || connecting) return connecting;
  connecting = mongoose
    .connect(mongodbUrl, { serverSelectionTimeoutMS: 2000, autoIndex: true })
    .catch(() => { connecting = null; }); // mongoose keeps retrying via the driver's monitoring
  return connecting;
}

const ready = () => mongoose.connection.readyState === 1;
const status = () => (!mongodbUrl ? 'disabled' : ready() ? 'up' : 'down');
const close = () => mongoose.disconnect();

connect();

module.exports = { ready, status, close, connect };
