const { port } = require('./config/env');
const app = require('./app');
const { startBackground } = require('./background');

const stopBackground = startBackground();
const server = app.listen(port, () => console.log(`procurement-portal listening on :${port}`));

// Finish in-flight jobs before exiting so a deploy does not leave work half done.
async function shutdown() {
  server.close();
  await stopBackground().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
