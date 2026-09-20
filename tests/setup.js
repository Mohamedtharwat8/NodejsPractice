// Closes the Redis and MongoDB connections after each test file so Jest can exit.
afterAll(async () => {
  require('../src/infra/redis').close();
  await require('../src/infra/mongo').close();
});
