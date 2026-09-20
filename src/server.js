const { port } = require('./config/env');
const app = require('./app');
const { startDrainWorker } = require('./modules/audit/drain');

startDrainWorker(); // moves audit events from the Postgres outbox to MongoDB every few seconds
app.listen(port, () => console.log(`procurement-portal listening on :${port}`));
