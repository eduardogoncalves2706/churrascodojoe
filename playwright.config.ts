import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173', viewport: { width: 360, height: 780 } },
  webServer: [
    { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
    // Site público, apontado pra API local (não a de produção) — usado pelo teste do carrinho.
    { command: 'PUBLIC_API_URL=http://localhost:3001 pnpm --filter @joe/site dev', url: 'http://localhost:4321', reuseExistingServer: true, timeout: 60_000 },
  ],
});
