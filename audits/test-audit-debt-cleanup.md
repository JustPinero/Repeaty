# Test Audit — debt-cleanup branch (PR #1)

Coverage check on the `debt-cleanup` branch (6 commits ahead of `main`) for every fixed DEBT entry, every Phase-6 fix-request that was deleted, and the icons/script + ipa-render contracts called out in the audit brief.

CI (in flight at the time of this audit): `validate.sh` ✓, `edge-functions` (Deno) ✓, `supabase migrations + integration + e2e` IN_PROGRESS. The validate + Deno legs are the load-bearing ones for this audit; the integration leg is the same surface that already passed on `phase-6-pwa-launch`.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 1     |
| Low      | 2     |

## Resolved DEBT coverage

| DEBT | Surface | Test(s) | Status |
| ---- | ------- | ------- | ------ |
| DEBT-003 (tts-jazh) | Edge Function handler | `supabase/functions/tts-jazh/handler.test.ts` — 11 cases (preflight, missing JWT, free-tier 403, malformed body, lang-not-in-{ja,zh}, 200-char cap, happy-path bytes, ja vs zh voice selection, AbortError → 504, 5xx → 502, 429) | ✓ |
| DEBT-003 (web client short-circuit) | `apps/web/src/platform/web.ts` `playTargetText` ja/zh branch | `web.test.ts` — covers fall-through to SpeechSynthesis when no session (mocks `getSession` → null). The Pro path itself (token present + 200 mp3 bytes) isn't directly asserted in a test; the failure-mode path IS covered. | partial — see Low-1 |
| DEBT-005 (audio-retention) | Edge Function handler | `supabase/functions/audio-retention/handler.test.ts` — 7 cases (preflight, 401-without-service-role, 405 non-POST, happy path with log assertion, no-stale-rows no-op, partial-failure successful-only nulled, 250 rows → 100/100/50 batching) | ✓ |
| DEBT-006 (E2E flake) | `pronunciation-session` flow | `e2e-manifest.json` flipped back to `in-progress` (status reverted in commit `5306820`); spec keeps the launch-flag wiring + the new "/app URL settled + 'Your decks' heading visible" waits. Re-deferred deliberately — not a test gap. | re-deferred (acknowledged) |
| DEBT-008 (pronunciation queueing) | Dexie schema v2 + replay | `offline-queue.test.ts` — 5 new pronunciation cases (persist with empty `uploaded_path`, `{ ok: true }` drain, `{ ok: false, uploaded_path }` checkpoint persist + skip-re-upload on 2nd pass, `{ ok: false }` bumps attemptCount only, 5-attempt poison-pill). Hook coverage in `usePronunciationSession.test.ts` — `offline: enqueues to the Dexie queue and throws OFFLINE_PRONUNCIATION_UNSUPPORTED`. | ✓ |

## Phase-6 fix-request → test mapping

The five fix-requests deleted from `requests/phase-6-fixes/` should each map to a test or a deliberate doc-only change. (Two fix-requests remain: `fix-bug-offline-banner-ux.md` + `fix-test-offline-banner.md` — same root, OfflineBanner not delivered. Acknowledged-but-not-blocking per the audit brief.)

| Fix-request (deleted) | Test that locks the fix in | Status |
| --------------------- | -------------------------- | ------ |
| `fix-bug-offline-replay-invalidation-key.md` | `useOfflineReplay.ts:46` now invalidates `['due-cards']` (matches `useDueCards`'s actual key); not directly asserted in a unit test, but the change is one-liner inline and visible in the diff. | doc-only / inline (Low-2) |
| `fix-bug-pronunciation-offline-message.md` | `usePronunciationSession.test.ts` — `offline: enqueues … throws OFFLINE_PRONUNCIATION_UNSUPPORTED` + `PronunciationSessionPage` renders "Saved offline. Your score will land when you're back online." (covered indirectly via `isOfflinePronunciationError` typed sentinel; UI-string assertion lives in the page render path) | ✓ (hook side); page-side string is not asserted in a render test (Med-1) |
| `fix-optimize-bundle-size-ci.md` + `fix-test-bundle-size-ci.md` | `.github/workflows/ci.yml:98–106` runs `pnpm build:size` after the production build. The build job is gated on `github.ref == 'refs/heads/main'`, which means the budget check fires on main pushes only — PRs don't run it. That's a deliberate scope choice (matches the existing pattern; main-only build). | ✓ (wired); see Low-1 about PR-time scope |
| `fix-optimize-precache-bounds.md` | `vite.config.ts:35` sets `maximumFileSizeToCacheInBytes: 5 * 1024 * 1024`. No unit test (config inspection only). | doc-only / config (per existing test boundary for SW) |
| `fix-test-bundled-decks-ipa-coverage.md` | `bundled-decks.test.ts` — `ja and zh bundled cards each carry a non-empty ipa (Whisper phonetic anchor)` integration test. | ✓ |
| `fix-test-session-offline-branches.md` | New tests in `useReviewSession.test.ts` (`offline: enqueues to the Dexie queue instead of upserting`), `useComprehensionSession.test.ts` (`offline: enqueues to the Dexie queue instead of inserting; result.attemptId is null`), `usePronunciationSession.test.ts` (offline branch, above). | ✓ |
| `fix-drift-replay-conflict-resolution.md` + `fix-test-replay-conflict-resolution.md` | `offline-queue.test.ts` — `review replay is upsert-last-wins (client overwrites unconditionally)` + `queued row exposes clientCreatedAt to the replay handler …`. Pins the v1 contract. References reconciliation: `repeaty-pwa.md` § Offline queue mentions client-wins; `offline-queue.ts` JSDoc cites the contract + the future-extension hook. | ✓ |

## Specific surface from the audit brief

- **`processOne` returns `retained` correctly:** `offline-queue.ts:250` declares `retained: boolean` in the return shape. Returns `false` on `result.ok` (deleted), `false` on poison-pill drop (deleted), `true` on transient-fail-without-drop. The `replayQueues` caller adds the id to `visited` only when `retained === true && item.id !== undefined`. That's the correct semantic — see Bughunt for the unbounded-growth analysis. **Locked in by:** `replay leaves transient-fail items in the queue + bumps attemptCount` and `replay drops items after 5 failed attempts (poison pill defense)`. ✓
- **ja/zh ipa renders are pinned:** `Flashcard.test.tsx` covers both `renders ipa (kana romanization / pinyin) under the native text when present, after reveal` and `omits the ipa line when ipa is null (non-CJK card)`. ✓
- **Icons script smoke-test exists:** `scripts/build-peaty-icons.test.ts` — 4 cases asserting source JPG presence + each of the three committed PNGs has the right format/dimensions. Wired into the root `pnpm test` via `vitest.scripts.config.ts`. ✓
- **Flashcard covers both ipa-present and ipa-absent:** see above. ✓

## Hook-side offline-branch coverage

The "high-priority Phase-6 fix" called out in the brief — offline branches of all three session hooks — has tests:

- `useReviewSession.test.ts:240–266` — `offline: enqueues to the Dexie queue instead of upserting`
- `useComprehensionSession.test.ts:245–278` — `offline: enqueues to the Dexie queue instead of inserting; result.attemptId is null`
- `usePronunciationSession.test.ts:273–316` — `offline: enqueues to the Dexie queue and throws OFFLINE_PRONUNCIATION_UNSUPPORTED`

All three follow the same shape: stub `navigator.onLine = false`, mock the `enqueue*` from `@/lib/offline-queue`, assert (a) enqueue called with the right payload, (b) the online write path NOT called, (c) the local UI state advances. Strong shape. ✓

## Findings

### Med-1 — `PronunciationSessionPage` offline-message string is not pinned in a render test

The fix-request `fix-bug-pronunciation-offline-message.md` was deleted. The hook side (typed sentinel `OFFLINE_PRONUNCIATION_UNSUPPORTED` + `isOfflinePronunciationError`) is well-tested. The actual user-facing string — `"Saved offline. Your score will land when you're back online."` in `PronunciationSessionPage.tsx:42` — is not asserted in any render test. A future copy-edit or refactor that branches on `isOfflinePronunciationError(err)` differently would silently drop the message. Not blocking — string is one line, change is reviewable in the diff — but worth a render test in the post-merge fix bundle.

→ Fix request: `requests/post-merge-fixes/fix-test-pronunciation-offline-message-render.md`

### Low-1 — TTS Pro happy-path (token present + 200 mp3 bytes returned) is not unit-tested in `web.test.ts`

`web.test.ts:6–12` mocks `@/lib/supabase` with `auth.getSession` returning `{ session: null }`, which exercises the early-return `if (!accessToken) return null;` branch (line 33 of `web.ts`). The fall-through to SpeechSynthesis IS tested. The "got a session, fetched the URL, got a 200 audio/mpeg blob, played it through `<audio>`" path is not asserted in jsdom. The Edge Function side IS tested in Deno. Acceptable — the boundary between web client and Edge Function is the contract; both sides assert it independently. Low because the failure mode (silent fall-through to SpeechSynthesis) is the desired behavior on any actual problem.

### Low-2 — `useOfflineReplay`'s invalidation key change is doc-only

`useOfflineReplay.ts:46–50` now invalidates `['due-cards']` (matches `useDueCards`'s real key), `['card-comprehension-history']`, `['card-pronunciation-history']`. The fix is the right one (the Phase-6 bughunt High-1 finding), but it has no direct unit assertion — there's no test that mounts the hook, primes the queue, fires `online`, and asserts `qc.invalidateQueries` is called with `['due-cards']`. The contract is checked at code review only. Low because the symptom of a regression is loud (dashboard "did my work save?" widget back to stale).
