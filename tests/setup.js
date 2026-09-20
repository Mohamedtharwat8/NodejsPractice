// Closes the Redis connection after each test file so Jest can exit.
afterAll(() => require('../src/infra/redis').close());
