import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://localhost/touchpoint_test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/__tests__/**'],
      thresholds: { lines: 70, functions: 70, branches: 60 },
    },
  },
});
