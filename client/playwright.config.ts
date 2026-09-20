import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4200', trace: 'retain-on-failure' },
  webServer: { command: 'node e2e/serve-dist.mjs', url: 'http://127.0.0.1:4200/login', reuseExistingServer: false },
});
