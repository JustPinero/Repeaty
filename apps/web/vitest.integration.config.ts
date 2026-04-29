import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Integration tests hit a live local Supabase. Required env vars:
//   SUPABASE_URL                 — typically http://127.0.0.1:54321
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//
// Locally:  supabase start && pnpm --filter @repeaty/web test:integration
// CI:       wired into the supabase-migrations job in .github/workflows/ci.yml.
//
// These tests run serially per-file (no concurrent file pool) so two test files
// don't fight over rate-limited auth signups. Inside a file, tests still run
// in declaration order with a shared cleanup hook.

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@repeaty/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
