# Fix — `workbox.globPatterns` is unbounded; precache list scales with `dist/` contents

**Severity:** Medium (optimize-phase-6 Med-1)
**Originating audit:** Phase 6 optimize
**Discovered:** 2026-04-30

## Root cause

`apps/web/vite.config.ts:27`:

```ts
globPatterns: ['**/*.{js,css,html,svg,woff2}'],
```

This precaches every JS/CSS/HTML/SVG/WOFF2 file in the build output, recursively, without an exclude list or per-file size cap. Today the bundle is small. Future risk:

- If Phase 7+ adds bundled audio TTS files (DEBT-003 future activation) or larger SVG sprites, they automatically join the precache and the first-install can balloon to multi-MB without anyone noticing in PR review.
- If `vite build --sourcemap=true` is ever flipped on, source maps land in the precache.

## Acceptance criteria

- [ ] Add `maximumFileSizeToCacheInBytes: 500_000` (500 KB per file ceiling) to the workbox config.
- [ ] Add `globIgnores: ['**/*.map']` to skip source maps.
- [ ] Confirm `pnpm --filter @repeaty/web build` still succeeds and the SW registers cleanly.

## Files to touch

- `apps/web/vite.config.ts`

## Optional — defer

Single-user beta; current bundle is well under 500 KB total. Reasonable to leave as a v1.x cleanup item.
