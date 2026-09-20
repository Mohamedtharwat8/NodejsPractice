// Closes the queue, Redis and MongoDB connections after each test file so Jest can exit.
afterAll(async () => {
  await require('../src/infra/queue').close();
  require('../src/infra/redis').close();
  await require('../src/infra/mongo').close();
});
