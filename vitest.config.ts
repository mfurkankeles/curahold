import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    // Builds the database every test file starts from (tests/global-setup.ts).
    globalSetup: ['tests/global-setup.ts'],
  },
});
