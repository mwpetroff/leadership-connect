/**
 * Workspace-level Vitest configuration.
 *
 * This config documents coverage expectations for the whole workspace.
 * Individual packages (e.g. artifacts/api-server) carry their own vitest.config.ts
 * which vitest uses when you run `pnpm --filter <pkg> run test`.
 *
 * Run all tests from the workspace root with:
 *   pnpm test
 *
 * Run with coverage:
 *   pnpm --filter @workspace/api-server run test:coverage
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Workspace-wide coverage expectations for key business logic files.
    // The api-server package enforces these thresholds in its own config.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // 80% threshold for critical business logic (suggestion engine, route handlers).
      // Applied per-package via package-level vitest.config.ts.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
