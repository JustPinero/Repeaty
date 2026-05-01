# Optimize — debt-cleanup branch (PR #1)

Performance + bundle-size + memory-pressure audit on the new surface.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 1     |
| Low      | 2     |

## Findings

### Med-1 — TTS blob cache should be LRU-bounded before activating more Pro languages

(Same finding as Bughunt Med-1; here viewed through the resource-cost lens rather than memory-leak lens.) `apps/web/src/platform/web.ts:17` `Map<string, Blob>` grows monotonically per session.

Cost-of-keeping during a long study session: ~10–15 KB per audio clip × cards-played. For v1 (single Pro user, ja/zh only, ≤ 70 distinct keys) this stays under 1 MB. Acceptable. When DEBT-002 (Capacitor) lands and the app stays resident across screen-locks (no tab close to GC the cache), or when more Pro languages activate, this becomes a real concern.

Recommended bound: 64 entries with LRU eviction (insertion-order Map + `delete(firstKey)` on overflow). 64 × ~15 KB = ~1 MB ceiling — same magnitude as the current worst case but bounded.

→ Fix request: `requests/post-merge-fixes/fix-optimize-tts-cache-lru.md`

### Low-1 — Confirmed: `sharp` is dev-only, not in the runtime bundle

The audit brief asks to verify `sharp` (added for `scripts/build-peaty-icons.ts`) is dev-only.

- `package.json` (root) line 33: `"sharp": "^0.34.5"` is in `devDependencies`. ✓
- `apps/web/package.json` does NOT depend on `sharp` at all (neither dep nor devDep). ✓
- `apps/web/vite.config.ts` doesn't import `sharp`. ✓
- The only imports of `sharp` are `scripts/build-peaty-icons.ts` (build-time CLI) and `scripts/build-peaty-icons.test.ts` (run by `vitest.scripts.config.ts` at the root, not by `apps/web`'s vitest). ✓

Sharp's native binaries (~30 MB for the linux/darwin/windows build) ship to `node_modules` only; they never reach the production bundle. Verified safe.

### Low-2 — Workbox 5 MB ceiling is generous; nothing in `dist/assets` approaches it

The audit brief asks to verify nothing in the build output approaches the new `maximumFileSizeToCacheInBytes: 5 * 1024 * 1024` ceiling that landed in `vite.config.ts:35`.

I cannot run a build here (audits don't lint/test). Static evidence:

- The largest assets in the precache will be (a) the main JS bundle (TanStack Query + Dexie + react-router + Zod + supabase-js + …), (b) the Peaty welcome JPG, (c) the three new PWA icon PNGs.
- Scripts/build-size-report.sh (now wired into CI on the `build` job) enforces a 500 KB gz total `.js` ceiling — which is well under 5 MB. So a regression that pushed JS over 5 MB would be caught at CI time by the bundle-size gate, not at runtime by Workbox dropping the asset.
- The icon PNGs are palette-encoded (per `build-peaty-icons.ts:46–52`'s `palette: true, colors: 128`) and the spec asserts ~78 KB total (DEBT-007 status note in `audits/debt.md:87`). Each ~25–35 KB, under any cap.
- The Peaty welcome JPG is a single illustration; v1 Phase-6 had an explicit "fits in precache" check during 6.2.

No file is realistically near 5 MB in v1. The 5 MB ceiling is the right "accidental fat asset" backstop, not a current concern.

### Low-3 — Bundle-size CI gate is wired but only on main pushes (not PRs)

`.github/workflows/ci.yml:78–106`: the `build` job runs `pnpm build:size` after the production build, but the job is gated on `if: github.ref == 'refs/heads/main'`. PRs targeting main don't run the budget check.

This is a deliberate scope choice — the existing pattern is "build runs on main only". Means a PR that bloats the bundle is caught only after merge. For Ben's solo-dev cadence (PR self-review + small commits) the latency between merge and detection is minutes, not days. Acceptable for v1.

If pre-merge enforcement becomes important, lift the `if:` and add `pnpm install --frozen-lockfile` upfront — already done in `validate`. Not blocking now.

### Re-confirmed efficient

- **`audio-retention` batching** — 100-row chunks (per `handler.ts:20` `STORAGE_REMOVE_BATCH = 100`). Matches Supabase Storage `remove()`'s API cap. Test `rows are batched in groups of ≤ 100` covers. Cron-driven, runs daily — no concurrency concern.
- **`tts-jazh` cache header** — `handler.ts:220` sets `'Cache-Control': 'public, max-age=86400'`. The browser will memo identical (text, lang) requests for 24 h independent of the JS-side `ttsBlobCache`. Two-layer cache (browser HTTP cache + JS Map) is consistent.
- **Cursor refactor in `replayQueues`** — replaces a `.toArray()` snapshot with a re-read-the-index loop. The performance characteristic is `O(n²)` worst-case (each `.first()` is `O(log n)` in IndexedDB index scan; n iterations) versus the old `O(n)` for snapshot. For Ben's offline queue depth (≤ dozens) the difference is sub-millisecond and the correctness gain (mid-drain inserts handled, no out-of-order replays from clock skew) is the right trade.
- **Pronunciation queue's two-stage replay** — `uploaded_path` checkpoint avoids re-uploading the audio Blob on every retry. Storage-API costs amortize across retries. ✓
