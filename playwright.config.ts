import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173', viewport: { width: 360, height: 780 } },
  webServer: { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
});
