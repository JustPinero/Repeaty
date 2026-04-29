# @repeaty/web

The PWA. Vite + React + TypeScript + Tailwind + shadcn/ui.

This package is **scaffolded by [Request 1.1](../../requests/phase-1-foundation/1.1-monorepo-scaffold.md)**. Until that request lands, this folder holds only the README + the public asset directory; running `pnpm install` doesn't do anything yet.

After 1.1:

```bash
pnpm --filter @repeaty/web dev          # dev server
pnpm --filter @repeaty/web typecheck    # tsc --noEmit
pnpm --filter @repeaty/web test         # vitest
pnpm --filter @repeaty/web test:e2e     # playwright (when flows exist)
pnpm --filter @repeaty/web lint         # eslint incl. jsx-a11y
pnpm --filter @repeaty/web build        # production bundle
```

See `references/architecture.md` for stack rationale and the dependency log.
