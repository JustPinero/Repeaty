# Optimize — Phase 6

Performance + bundle-size + runtime-efficiency review of the Phase-6 surface. The two material questions: (a) what does dexie + vite-plugin-pwa cost the bundle, and (b) is the SW precache list bounded? Both answer "yes, fine for v1" — no critical performance regressions. The real optimization gap is that the bundle-size guard exists as a script but isn't wired to CI.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 2     |
| Low      | 2     |

## Findings

### Medium-1 — `workbox.globPatterns` is unbounded; precache list scales with `dist/` contents

`apps/web/vite.config.ts:27`:

```ts
globPatterns: ['**/*.{js,css,html,svg,woff2}'],
```

This precaches every JS/CSS/HTML/SVG/WOFF2 file in the build output, recursively, without an exclude list. Today the JS+CSS surface is small (~few hundred KB). But:

1. **Peaty illustrations are jpg/png** — those don't match `globPatterns` and are runtime-cached via the `/peaty/.*\.(jpg|png|webp)` rule with `maxEntries: 32`. Good — they're not double-cached.
2. **Future risk:** if Phase-7 adds bundled audio TTS files (per ADR-004 / DEBT-003 future activation) or larger SVG sprites, they automatically join the precache. The first install can balloon to multi-MB without anyone noticing in PR review.

The fix is cheap: cap individual files via `maximumFileSizeToCacheInBytes` (default 2 MB; could tighten to 500 KB) and explicitly `globIgnores: ['**/*.map']` to skip source maps if `vite build --sourcemap=true` is ever flipped on. No urgency for v1.

→ Fix request: `requests/phase-6-fixes/fix-optimize-precache-bounds.md`

### Medium-2 — Bundle-size guard is honor-system

Per the test-audit (Med-2 there): `scripts/build-size-report.sh` exists and works, but no `package.json` script exposes it (`apps/web/package.json` has no `build:size`) and `.github/workflows/ci.yml` doesn't run it. The 500 KB ceiling is enforced only when a developer remembers to run the script manually.

This is the same finding as test-audit Med-2 viewed from the perf-discipline angle. Without CI enforcement, the bundle can drift past 500 KB across phases without anyone catching it until Lighthouse-time — and Phase 6 is the last gate where someone will actively look.

→ Fix request: `requests/phase-6-fixes/fix-optimize-bundle-size-ci.md` (covers same scope as test-audit Med-2 — same fix, same file)

### Low-1 — Dexie + vite-plugin-pwa bundle delta

- `dexie@4.4.2`: ~30 KB gz (matches the request's pre-flight estimate). All offline-queue helpers tree-shake into one chunk.
- `vite-plugin-pwa`: dev-only at install; the runtime emit is the SW itself (~10 KB gz of Workbox boilerplate) + the `virtual:pwa-register` shim that `main.tsx` imports dynamically. The dynamic import means it's a separate chunk, not in the main bundle.

Net: dexie hits the main bundle (~30 KB gz); vite-plugin-pwa runtime hits a separate chunk (~10 KB gz). Both fit comfortably under the 500 KB ceiling. No optimization needed.

(No fix-request.)

### Low-2 — `useOfflineReplay` always rebinds the `online` listener on `qc` change

`apps/web/src/lib/useOfflineReplay.ts:21` has `useEffect(..., [qc])`. `useQueryClient()` returns a stable ref from the QueryClientProvider — the effect realistically only runs once per provider mount. But if a future refactor wraps the app in `<QueryClientProvider client={...}>` with a non-memoized client (a known antipattern), this effect would re-add and remove the `online` listener on every render.

Cheap defense: the effect's dependency list could just be `[]` since the inner closure reads `qc` via the closure capture and the listener body is idempotent. Or memoize the `drain` function with `useCallback` and key the effect on that. Negligible perf impact in current code; flagged for hygiene.

(No fix-request — micro-hygiene.)

## Items confirmed efficient

- **Dexie schema indexes** (`apps/web/src/lib/offline-queue.ts:48-51`): `pending_reviews` and `pending_comprehension_attempts` both index `user_id`, `card_id`, `clientCreatedAt`. The replay loop's `orderBy('clientCreatedAt').toArray()` uses the index — O(log n) seek + scan, not a table scan. Lookup pattern matches.
- **The replay loop processes serially** (`for (const item of items)` with `await` per row) rather than `Promise.all` flooding supabase-js with concurrent upserts. Correct: Supabase has per-IP rate limiting; a 50-row offline queue replayed in parallel could trip it. Sequential is right.
- **`canQueue()` short-circuit** (`if (!canQueue()) return`) keeps the helpers safe in SSR / no-IndexedDB envs without a Dexie crash. Good.
- **Lazy-loading of `/admin` + `/generate`** in `apps/web/src/routes/index.tsx` correctly uses `React.lazy(() => import('@/features/...'))` with named-export wrapper. Both routes are gated (admin behind `AdminGuard`, generate is Pro-only on the Dashboard CTA path) so free-tier users never trigger the dynamic import. Net win on initial bundle for the 90% of users who never hit those routes.
- **vite-plugin-pwa SW registration** is gated on `import.meta.env.PROD` in `apps/web/src/main.tsx:14` and dynamically imported. Dev-server users pay zero SW cost; prod users pay one network round-trip per page load to fetch `/sw.js` (cached by the browser after the first hit anyway).
- **Service-worker runtime caching for Peaty assets**: `maxEntries: 32, maxAgeSeconds: 30 days`. Bounded both ways — won't grow unbounded; won't go stale beyond 30 days. Sound for the asset class (illustrations don't change in production without a hash bump).
- **Manifest theme colors** (`#7bbf3a` green / `#fff7e6` cream) are hex literals in both the JSON manifest and `index.html` — single source of truth is the JSON manifest; the HTML `<meta name="theme-color">` is the install-prompt fallback. Browsers prefer the manifest at PWA install time; both agreeing reduces the "color flash" on first launch.
