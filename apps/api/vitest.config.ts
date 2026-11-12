import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { env: { AUTH_MOCK: 'admin', DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://joe:joe@localhost:5433/joe' }, fileParallelism: false, testTimeout: 20000 } });
