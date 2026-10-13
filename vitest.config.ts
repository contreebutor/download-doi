import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // The SQLite-backed services share one process-wide connection.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
