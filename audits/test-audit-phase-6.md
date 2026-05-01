# Test Audit — Phase 6

Coverage of every acceptance criterion in `requests/phase-6-pwa-launch/6.{1..6}-*.md` against tests on `phase-6-pwa-launch` (HEAD `4185ff6`).

Local validate is green. The Phase-6 surface — bundled decks, manifest, SW config, Dexie offline queue infrastructure — is covered well at the unit + live-Supabase level. The two real coverage gaps are (a) the offline branches in `useReviewSession.submitRating` and `useComprehensionSession.submitResponse` (not exercised in their hook tests despite being session-write critical paths) and (b) the bundle-size CI wiring is missing — `scripts/build-size-report.sh` exists but `.github/workflows/ci.yml` never runs it.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 1     |
| Medium   | 3     |
| Low      | 2     |

## 6.1 — Bundled decks (de, it, ru, ja, zh)

| Criterion                                                                      | Test                                                       | Status |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------ |
| Each of de/it/ru/ja/zh has a starter A1 deck                                   | `bundled-decks.test.ts` per-language loop                  | ✓      |
| Each deck has 25–35 cards                                                      | same                                                       | ✓      |
| Every card has target_text + native_text + language_code                       | same (`every bundled card has …`)                          | ✓      |
| Cards survive `supabase db reset` (UUIDv5 determinism)                          | `seed-decks.test.ts` (existing)                            | ✓      |
| ja/zh `ipa` populated                                                          | (no explicit assertion — see Med-1)                        | partial |
| Onboarding lets the user pick any of 7 langs                                   | `signup-and-onboarding.spec.ts` E2E                        | ✓      |
| Per-language similarity normalization (NFKC for ja/zh, no-fold for ru)          | `similarity.test.ts` (existing)                            | ✓      |

## 6.2 — PWA manifest + InstallHint

| Criterion                                                                      | Test                                                       | Status |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------ |
| `manifest.webmanifest` exists with required fields                             | `pwa-install-and-offline.spec.ts` GET smoke                | ✓      |
| `<link rel="manifest">` + apple-touch-icon + theme-color in index.html         | (filesystem-only; not asserted in any spec)                | partial |
| 192/512/maskable PNG icons present                                             | filesystem (DEBT-007)                                      | **deferred** |
| InstallHint pill renders only on iOS Safari + non-standalone + non-dismissed   | `InstallHint.test.tsx` (5 cases)                           | ✓      |
| Dismiss is sticky via localStorage                                             | same                                                       | ✓      |

DEBT-007 properly captures the icon-asset deferral (Lighthouse PWA-icon audit will dock points until 192/512/maskable PNGs land). Acceptable per audit brief — Lighthouse score gaps are not blockers.

## 6.3 — Service worker + Workbox runtime caching

| Criterion                                                                      | Test                                                       | Status |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------ |
| `vite-plugin-pwa` wired into `vite.config.ts`                                  | static (compiled successfully → smoke proven by `pnpm build`) | ✓ (build-time only) |
| Service worker registers in production                                          | manual / Lighthouse                                        | not unit-testable |
| Static assets precached                                                         | manual / Lighthouse                                        | not unit-testable |
| `/peaty/*` CacheFirst                                                          | inspected in `vite.config.ts`                              | ✓ (config-side) |
| `*.supabase.co/(rest|storage|functions|auth)/` NetworkOnly                     | inspected in `vite.config.ts`                              | ✓ (config-side) |
| SW scope `/`                                                                   | (default; no test)                                         | implicit |

Per audit brief: SW behavior is not jsdom-testable. Build-time plugin + config inspection is the correct test boundary. The `pwa-install-and-offline.spec.ts` E2E spec runs against the dev server (`devOptions.enabled = false` → no SW), so it explicitly does NOT assert SW activation. That's documented in the spec header. Manual / Lighthouse on `pnpm preview` is the runtime-side verification.

## 6.4 — Offline queue (Dexie)

| Criterion                                                                                   | Test                                                  | Status |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| Dexie tables exist with the right schema                                                    | `offline-queue.test.ts`                               | ✓      |
| `enqueueReview` / `enqueueComprehension` persist to IndexedDB                                | same                                                  | ✓      |
| `replayQueues()` flushes all queues in chronological order                                   | same (`replay processes items in chronological order`) | ✓      |
| Replay handles per-row failures by leaving items in queue + bumping attemptCount             | same (`replay leaves transient-fail items …`)         | ✓      |
| Poison-pill drop after 5 attempts                                                            | same (`replay drops items after 5 failed attempts`)   | ✓      |
| Replay handles Supabase 401 (re-auth) without losing items                                   | (covered indirectly by transient-fail test)           | partial — see Med-2 |
| Conflict resolution: server wins; client overwrites only when client row strictly older      | (no test; `clientCreatedAt` field exists but no test logic checks it on replay) | **MISSING** — see Low-1 |
| `useReviewSession.submitRating` falls through to enqueue when offline                        | (no hook test)                                        | **MISSING** — see High-1 |
| `useComprehensionSession.submitResponse` falls through to enqueue when offline               | (no hook test)                                        | **MISSING** — see High-1 |
| `usePronunciationSession.submitRecording` falls through to queue                             | (DEBT-008 captures the deferral)                      | **deferred** |
| `OfflineBanner` shows queue depth + last-replay timestamp                                    | (component never built)                               | **MISSING** — see Med-3 |

`offline-queue.test.ts` covers infrastructure cleanly (7 cases, fake-indexeddb-backed). The hook-side branches that decide enqueue-vs-direct-write are the user-visible critical path and not unit-tested.

## 6.5 — Lighthouse + bundle size + README

| Criterion                                                                      | Test / Verification                                        | Status |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------ |
| Lighthouse PWA / Perf / A11y / Best Practices ≥ 90                              | manual                                                     | not blocker |
| Main bundle gz ≤ 500 KB                                                         | `scripts/build-size-report.sh` (exists)                    | ✓ script-side |
| Lazy-load `/admin` + `/generate`                                                | `routes/index.tsx` uses `React.lazy` + `Suspense`         | ✓ static |
| README covers what / screenshots / stack / run-local / contribute / arch link  | manual                                                     | ✓ manual |

`scripts/build-size-report.sh` is shipped, but **`.github/workflows/ci.yml` never invokes it** and `apps/web/package.json` has no `build:size` task. The 500-KB ceiling is therefore enforced only when a developer remembers to run the script — not in CI as the request specified. See Med-2.

## 6.6 — `pwa-install-and-offline` E2E

| Criterion                                                                      | Test                                                       | Status |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------ |
| Spec at `apps/web/tests/e2e/pwa-install-and-offline.spec.ts` exists            | filesystem                                                 | ✓      |
| Manifest fetch returns 200 + valid JSON + expected name + start_url            | `manifest.webmanifest serves valid JSON …` test            | ✓      |
| User offline → enqueue lands in IndexedDB                                      | `offline → enqueue → reconnect → replay …` test           | ✓ (synthetic enqueue, not driven through the session UI — see Low-2) |
| User reconnects → queue drains                                                 | same                                                       | ✓      |
| `e2e-manifest.json.flows.pwa-install-and-offline.status = "complete"`          | manifest                                                   | ✓      |

## Findings

### High-1 — Hook-side offline branches (`useReviewSession.submitRating`, `useComprehensionSession.submitResponse`) lack unit-test coverage

`useReviewSession.ts:139` and `useComprehensionSession.ts:143` both branch on `navigator.onLine === false` to call `enqueueReview` / `enqueueComprehension` instead of the direct supabase write. This is the user-visible critical path of the entire offline-queue feature — Ben rates a card on the subway, the rating is supposed to enqueue, the dashboard counts adjust, the row drains on reconnect. The infrastructure (`offline-queue.test.ts`) is well tested in isolation, but the integration glue is not.

There is no `useReviewSession.test.ts` exercising the offline branch (it goes through the existing real `useReviewSession.test.tsx` only for the online-path schedule + upsert flow), and `useComprehensionSession.test.ts` likewise has no offline-mode assertion. A regression that swaps `=== false` for `=== true` or removes the branch entirely lands silent. The E2E `pwa-install-and-offline.spec.ts` enqueues synthetically (it imports `offline-queue.ts` directly via `page.evaluate`) precisely to dodge driving the session UI offline — so the path is unverified end-to-end too.

→ Fix request: `requests/phase-6-fixes/fix-test-session-offline-branches.md`

### Medium-1 — Bundle-size CI wiring is missing

Request 6.5: "`pnpm build:size` task that emits the gz size of `dist/assets/index-*.js`… CI runs it on main." The bash script (`scripts/build-size-report.sh`) was authored, but `apps/web/package.json` does not expose `build:size`, the root `package.json` has no entry, and `.github/workflows/ci.yml` does not call it from any job. The 500-KB ceiling is honor-system. A regression that pushes the bundle past 500 KB (a heavy lib added unaware in Phase 7) lands without CI failing.

→ Fix request: `requests/phase-6-fixes/fix-test-bundle-size-ci.md`

### Medium-2 — No assertion that ja/zh starter cards have populated `ipa`

`scripts/seed/decks/starter-{ja,zh}-a1.yaml` carry `ipa` for every card, and the request explicitly calls out this requirement ("Each card has target_text, native_text, and an optional ipa for ja/zh"). `bundled-decks.test.ts` asserts target/native/language_code are present but does NOT assert that ja/zh cards specifically have non-null `ipa`. A regression where seed-decks.ts drops the `ipa` field would not fail any test.

→ Fix request: `requests/phase-6-fixes/fix-test-bundled-decks-ipa-coverage.md`

### Medium-3 — `OfflineBanner` was not built

Request 6.4 lists `apps/web/src/features/dashboard/OfflineBanner.{tsx,test.tsx}` under files-to-touch. Neither file exists. The acceptance criteria don't list "OfflineBanner renders" as a discrete bullet (the criteria are about the queue mechanics), so this is a request-scope drift rather than an unmet AC — but the component was the user-visible signal that the offline queue is doing something (queue depth + last-replay timestamp). Without it, Ben has no UX hint that an offline rating was even captured.

The E2E spec works around this by polling `queueDepth()` directly via `page.evaluate`. That confirms the queue works — but in production Ben sees nothing.

→ Fix request: `requests/phase-6-fixes/fix-test-offline-banner.md`

### Low-1 — No test for the "client overwrites only when client row strictly older" conflict-resolution rule

`references/repeaty-pwa.md` § Offline queue and request 6.4 both promise: "Conflict resolution: server wins; client overwrites only when a review for the same card was strictly older." The current `replayQueues` logic upserts unconditionally — there's no `clientCreatedAt > server.last_reviewed_at` check before the upsert. The test suite has no failing case for this either; the current implementation is "client always wins on the upsert" because `onConflict: 'user_id,card_id'` overwrites without comparison.

This may be acceptable v1 behavior (the user replaying their own queued review is unlikely to step on a more-recent server change for the same card), but the doc and the request both promise a stricter rule. Either tighten the code or relax the doc — covered in drift-audit.

→ Fix request: `requests/phase-6-fixes/fix-test-replay-conflict-resolution.md`

### Low-2 — `pwa-install-and-offline` E2E enqueues synthetically, not via the session UI

The spec imports `/src/lib/offline-queue.ts` at runtime via `page.evaluate` and calls `enqueueComprehension` directly, bypassing `useComprehensionSession`. The spec header explicitly explains this is to dodge the same `/app/decks` race that DEBT-006 captures. Coverage is partial — the manifest + queue infrastructure + replay drain are exercised, but the hook → queue glue is not. Combined with High-1, the production code path that Ben actually walks is unverified end-to-end. Low rather than High because the unit-level fix-request closes the bigger gap.

(No fix-request — covered by High-1.)

## Items confirmed in lockstep

- `bundled-decks.test.ts` per-language loop covers all 7 languages cleanly.
- `InstallHint.test.tsx`'s 5 cases match the matrix (iOS-not-standalone-not-dismissed / Chrome / standalone / dismissed-sticky / dismiss-click) called out in the request.
- `useFeedback.test.ts` rate-limited fallback test (chore-6.0 part 2) is in place; useFeedback now calls cannedFallback only on RATE_LIMITED, not on transport / 5xx.
- The 5 new live-Supabase RPC integration suites (`bump-rate-limit-decrement-rpc`, `get-recent-weak-words-rpc`, `insert-ai-deck-with-cards-rpc`, `list-admin-profiles-rpc`, plus `bundled-decks` extension) are present per chore-6.0 deferred fixes.
- `ai-deck-generation-pro` E2E + `pwa-install-and-offline` E2E both flipped to `complete` in `e2e-manifest.json`; `comprehension-session` + `pronunciation-session` correctly stay `in-progress` per their open DEBTs.
