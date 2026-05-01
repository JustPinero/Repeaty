# Drift Audit — Phase 6

Doc-vs-code consistency check for the Phase-6 surface. Items marked **PATCHED** have been corrected in-place per the audit-gate brief; items marked **fix request** require code changes and are tracked under `requests/phase-6-fixes/`.

## Summary

| Severity | Count | Of which patched |
| -------- | ----- | ---------------- |
| Critical | 0     | 0                |
| High     | 3     | 3                |
| Medium   | 1     | 0                |
| Low      | 2     | 0                |

## High (all patched in this audit)

### High-1 — `references/repeaty-pwa.md` § Service worker described three caching strategies; code ships two runtime-cache rules + a precache (PATCHED)

The doc enumerated:
1. Static assets (CacheFirst)
2. Bundled deck JSON + audio TTS metadata (StaleWhileRevalidate)
3. API calls (NetworkOnly)

The shipped `apps/web/vite.config.ts` actually has:
- `workbox.globPatterns` precache for `**/*.{js,css,html,svg,woff2}` (replaces #1).
- Runtime CacheFirst for `/peaty/*.{jpg,jpeg,png,webp}` (Peaty illustrations only — bundled deck JSON is inside the precache, not a runtime rule).
- Runtime NetworkOnly for `*.supabase.co/(rest|storage|functions|auth)/`.

There is no StaleWhileRevalidate rule. The "audio TTS metadata" mention is out of scope for v1 (DEBT-003 future).

**Patched:** rewrote § Service worker to describe the as-shipped configuration: install-time precache via `globPatterns` + two runtime rules (Peaty CacheFirst + Supabase NetworkOnly). Documented `skipWaiting + clientsClaim` lifecycle behavior. Pointed at `apps/web/vite.config.ts` as source of truth.

### High-2 — `references/repeaty-pwa.md` § Offline queue described three queues; v1 ships two (PATCHED)

The doc listed `pending_reviews`, `pending_pronunciation_attempts`, and `pending_comprehension_attempts`. The shipped `apps/web/src/lib/offline-queue.ts` defines only `pending_reviews` and `pending_comprehension_attempts`. Pronunciation queueing is deferred per DEBT-008.

**Patched:**
- Updated § Offline queue to describe the v1-shipped two-queue surface.
- Added explicit "deferred to DEBT-008" note for pronunciation queueing, with the user-visible failure mode (audio upload errors at submit time).
- Documented the actual v1 conflict-resolution behavior (`onConflict: 'user_id,card_id'` overwrite) and flagged the gap vs the "client overwrites only when older" rule the original spec promised — that's now tracked as a fix request (see Med-1 below).
- Added the 5-attempt poison-pill defense + 401 re-auth handling note.

### High-3 — `references/repeaty-pwa.md` § Manifest had `theme_color: TBD` and didn't reflect the shipped `scope` / `orientation` fields (PATCHED)

The shipped `apps/web/public/manifest.webmanifest` has `theme_color: #7bbf3a`, `background_color: #fff7e6`, `scope: /`, `orientation: portrait`. The doc still said `theme_color: TBD` and omitted scope + orientation. Also: the doc described 192/512/maskable icons as the v1 shape; the manifest currently has a single-icon fallback (`peat-start.jpg, sizes: any`) per DEBT-007.

**Patched:** updated § Manifest to match shipped values and pointed at DEBT-007 for the icon-asset deferral.

## Medium

### Medium-1 — `useOfflineReplay` upserts unconditionally; the doc + request 6.4 both promised "client wins only when client row is strictly older"

`apps/web/src/lib/useOfflineReplay.ts:60-72` does `supabase.from('reviews').upsert(..., { onConflict: 'user_id,card_id' })` without a `clientCreatedAt > server.last_reviewed_at` comparison. The shipped behavior is "client always wins on the upsert."

Both `references/repeaty-pwa.md` and `requests/phase-6-pwa-launch/6.4-offline-queues-dexie.md` promised the stricter rule. The drift can be resolved either by (a) implementing the stricter check or (b) relaxing the doc to match shipped behavior. For Phase-6 the patch above relaxed the doc to match code (since the v1 risk of a same-card replay vs a more-recent server-side change is low — single-user beta) and flagged a code-side fix-request to consider activating the stricter rule before multi-user beta.

→ Fix request: `requests/phase-6-fixes/fix-drift-replay-conflict-resolution.md`

## Low

### Low-1 — `references/architecture.md` Dependency log was missing `dexie` + `fake-indexeddb`; vite-plugin-pwa version pin was `latest` (PATCHED)

The Phase-6 dependency log entry only listed `vite-plugin-pwa` with `Version: latest`. Actual `apps/web/package.json` has `vite-plugin-pwa@^1.2.0`, `dexie@^4.4.2` (runtime), `fake-indexeddb@^6.2.5` (dev). Coding standard 4 says "new deps must be justified in `architecture.md`" and the version pin should match the lockfile.

**Patched:** rewrote the "Installed in Request 6.3" header to "Installed in Request 6.3 (Workbox SW) and 6.4 (Dexie offline queue)", added `dexie` + `fake-indexeddb` rows with their actual versions and bundle costs, fixed `vite-plugin-pwa` to `^1.2.0`. Also removed `dexie` and `workbox-*` from the "Pending (added in later requests)" sub-section since both are now shipped (workbox-* is a transitive dep of vite-plugin-pwa, not a direct dep).

### Low-2 — `e2e-manifest.json` flow statuses correctly reflect Phase 6

Cross-confirmed:
- `signup-and-onboarding`: complete (Phase 1) ✓
- `flashcard-review-session`: complete (Phase 2) ✓
- `comprehension-session`: in-progress (open DEBT) ✓
- `pronunciation-session`: in-progress (DEBT-006) ✓
- `ai-deck-generation-pro`: complete (chore-6.0) ✓
- `pwa-install-and-offline`: complete (Phase 6.6) ✓

Five of six at `complete`, two at `in-progress` — matches the audit-brief expectation.

(No drift; logged for completeness.)

## Items confirmed in lockstep

- `audits/debt.md` correctly carries DEBT-007 (PWA icons / Peaty poses, originating phase 6.2) and DEBT-008 (pronunciation queueing, originating phase 6.4) with full activation steps.
- DEBT-007 is referenced from the PWA manifest doc (after the patch above).
- DEBT-008 is referenced from the offline queue doc (after the patch above).
- `references/api-contracts.md` does not need a Phase-6 update — no new Edge Functions shipped this phase.
- `references/schema.md` does not need a Phase-6 update — no new tables or RPCs shipped this phase (Phase 5 SQL migrations 0019/0020 already documented in `chore(6.0)`).
- `apps/web/index.html` `<meta name="theme-color">` matches the manifest's `theme_color` (`#7bbf3a`).
- `apps/web/src/main.tsx` SW registration is gated on `import.meta.env.PROD` per the request spec.
- `references/deployment-landmines.md` § Bundle size already documents the 500 KB gz ceiling (the new `scripts/build-size-report.sh` enforces this number locally; CI wiring is the test-audit / optimize-audit Med-2 finding).
