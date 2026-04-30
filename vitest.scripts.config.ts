import { defineConfig } from 'vitest/config';

// Vitest config scoped to top-level scripts (e.g. scripts/seed/seed-decks.ts).
// apps/web's vitest config doesn't see these files; this fills the gap.
// Run via `pnpm test:scripts` (root package.json) or directly:
//   pnpm exec vitest run --config=vitest.scripts.config.ts

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['scripts/**/*.test.ts'],
  },
});
