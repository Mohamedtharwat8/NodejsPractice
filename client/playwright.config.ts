import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4200', trace: 'retain-on-failure' },
  webServer: { command: 'npm start -- --host 127.0.0.1 --port 4200', url: 'http://127.0.0.1:4200/login', reuseExistingServer: true },
});
