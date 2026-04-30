# TestAudit — Phase 3 (Comprehension Mode)

Mode: quick. Scope: files modified between `main` and `phase-3-comprehension` HEAD (5 commits, ~25 source files).

## Overall grade: **B**

The pure logic shipped in `@repeaty/shared` is comprehensively tested: `similarity.test.ts` covers 12 cases including NFC composition, Latin diacritic fold per language, the Russian Ё/Е semantic distinction, NFKC full/half-width for ja/zh, the 1-typo proximity floor, and purity. `comprehension-score.test.ts` covers the 0-similarity short-circuit, the speed-floor at 30s, the score clamp, and bucket boundaries (90, 60). Both files map every acceptance criterion in 3.1 and 3.3 to a named test.

The session-orchestration hook (`useComprehensionSession.test.ts`) is the strongest hook test in the codebase to date — 10 cases covering hydration, submit→pendingResult→next cycling, miss-bucket scoring, isComplete + averages, DECK_NOT_FOUND propagation, cards-query error path, the new `comprehension_attempts` insert payload, the correct=false branch, and the don't-block-on-RLS-failure branch. Phase-2's W-2 (re-entrancy) finding and the chore(3.0) fix to `useReviewSession` did not transfer to `useComprehensionSession` — see finding T-3 below.

The integration test (`comprehension-attempts-rls.test.ts`) is correctly scoped: WITH-CHECK on insert, cross-user read isolation, and a trusted service-role-inserted row that user B can't see. Three assertions, all on the load-bearing security control.

Three material gaps: (1) the FeedbackPanel render in `ComprehensionSessionPage` is not asserted by any test (3.5's "ComprehensionSessionPage shows the feedback under the result when bucket ≠ 'perfect'" acceptance criterion is unverified), (2) `CardDetail.tsx` was shipped with a tests-after escape but no smoke test exists (the brief said "smoke-only" but the file is wholly untested), and (3) the comprehension hook lacks the re-entrancy guard test that `useReviewSession.test.ts` got via the chore(3.0) fix — the hook accepts re-entrant `submitResponse` calls without a ref-guard.

## Per-area grades

| Area                                                   | Grade | Notes                                                                                                  |
| ------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------ |
| `similarity.ts` (3.1)                                  | A     | All 12 cases mapped to ACs. NFC, Latin fold, Russian non-fold, NFKC, edit-distance threshold, purity   |
| `comprehension-score.ts` (3.3)                         | A     | 7 score cases + 3 bucket cases. Speed-floor, clamp, determinism, boundary 90/60                        |
| `Timer.tsx` (3.2)                                      | A     | Initial value, elapsed, ARIA label, tabular-nums style. Time-dependent assertions tolerate ~100ms jitter |
| `useComprehensionSession.ts` (3.2 + 3.4)              | B+    | Strong: 10 cases incl. RLS-failure-non-blocking. Missing: re-entrancy guard test (same gap as Phase-2 W-2 was for review) |
| `ComprehensionSessionPage.tsx` (3.2 + 3.5)             | C     | 6 cases — loading, prompt+input+submit, trim+submit, result+Next, completion summary, deck-not-found. **Missing FeedbackPanel render assertion (3.5 AC unverified)** |
| `useFeedback.ts` + `canned-text.ts` (3.5)              | A     | 6 cases: null-on-perfect, close text, miss text, language differentiation (en vs es), unsupported→en fallback, isLoading=false |
| `FeedbackPanel.tsx` (3.5)                              | F     | No dedicated test file. Behavior is exercised only transitively (and incompletely) via the page test.  |
| `CardComprehensionHistory.tsx` (3.4)                   | A     | 5 cases: empty, populated rows w/ correctness+ms+date, error alert, load-more shown @ pageSize, hidden < pageSize |
| `CardDetail.tsx` (3.4)                                 | F     | **No tests.** Tests-after escape was claimed as "smoke-only" — no smoke test was authored             |
| `DeckListItem.tsx` refactor (3.2)                      | A     | Two action links covered (Review + Comprehension), aria-labelled, href asserted                        |
| `comprehension-attempts-rls.test.ts` (3.4 integration) | A     | Three assertions cover the policy: insert-own, WITH-CHECK on foreign user_id, cross-user read isolation |
| Routing (`apps/web/src/routes/index.tsx`)              | F     | **`/app/decks/:deckId/cards/:cardId` route is not registered (see BugHunt C-1).** No test catches this — route table is untested |
| Phase-2 fix-coverage carry-forward                     | A     | `useReviewSession.test.ts` gained the DECK_NOT_FOUND test, the sentinel-detector test, and a re-entrancy ignored-second-call test. `Flashcard.test.tsx` gained a TTS-error logging test |

## Specific findings

1. **T-1 (Critical-path) — `ComprehensionSessionPage.test.tsx` does not assert that `<FeedbackPanel>` is rendered when `bucket !== 'perfect'`.** Request 3.5 lists this as the page-level AC: "ComprehensionSessionPage shows the feedback under the result when bucket ≠ 'perfect' — `ComprehensionSessionPage.test.tsx`". The page renders `<FeedbackPanel ... />` unconditionally inside the `result` branch, but no test asserts that the canned text is visible. A regression that, e.g., wraps `<FeedbackPanel>` inside `result.bucket !== 'perfect'` (thereby hiding it for `'close'` correctly but breaking for `'miss'`) would not be caught. The page test mocks the hook but does NOT mock `useFeedback`, so the actual canned-text lookup runs — a `toBeInTheDocument` on the canned phrase is achievable.

2. **T-2 — `CardDetail.tsx` has no test file.** The brief says "tests-after escape was applied to … CardDetail page (smoke-only)". The escape requires the test to exist before "done". No `apps/web/src/pages/CardDetail.test.tsx` exists. At minimum a smoke test (renders without throw, shows the back link, shows "Loading…" then "Card not found" when card is null) is required. Combined with the route-not-registered Critical (BugHunt C-1), this page is wholly untested AND unreachable in production.

3. **T-3 — `useComprehensionSession` has no re-entrancy guard, and no test asserts protection against double-submit.** Phase-2 W-2 noted that `useReviewSession.submitRating` was vulnerable to re-entrant calls and was fixed in chore(3.0) with a `submittingRef`. The fix's comment block explicitly mentions the comprehension mode as a future caller that benefits ("auto-rate-on-timeout for comprehension mode"). The new `submitResponse` does NOT carry the same `submittingRef` pattern; a re-entrant call (e.g. user double-tapping Enter, or future auto-submit on timeout) would issue two `comprehension_attempts` inserts and double-count the response in the running results array. The page guards via `submitting` boolean, but the hook contract is exposed without internal guard. No test pins this contract.

4. **T-4 — `FeedbackPanel.tsx` has no dedicated test file.** The component is small (loading-state branch + null-text branch + canned-text render), but its branches matter: the `isLoading` branch (5.0 swap) is structurally exercised only by `useFeedback.test.ts`, not at the panel level. Acceptable as tests-after for v1 (the component is stub-thin and the hook tests cover the behaviors), but should land before Phase 5 swaps in async loading behind it.

5. **T-5 — Timer test is time-dependent.** `Timer.test.tsx` lines 9 and 14 assert against `Date.now()` race tolerances (`/^0\.[01]s$/` and `/^3\.[4-6]s$/`). On slow CI runs (or under heavy parallelism) the `Date.now()` between test setup and component-internal `Date.now()` may exceed 100ms, flaking. Not a blocker but a future flake source. Mitigation: `vi.useFakeTimers({ now: <fixed-epoch> })`.

6. **T-6 — `CardComprehensionHistory.test.tsx` uses 4-deep `.eq().eq().order().limit()` chain mocks.** Same fragility as the Phase-2 W-2/T-2 finding. If the production code drops a `.eq()` call (e.g. relies on RLS instead of `eq('user_id')`), the chain mock returns the wrong shape and tests pass coincidentally. Worth a fix.

7. **T-7 — `comprehension-score.test.ts` has no integration check that `bucket(comprehensionScore(0.59, 100))` aligns with the `correct = bucket !== 'miss'` rule the hook uses.** The 0.59 boundary case isn't asserted. Edge case: `comprehensionScore(0.6, 1000) = 60 → 'close'` is correct, but the threshold is the same as `score ≥ 60`; a future formula tweak that rounds 59.5 → 60 changes behavior. Add a "correct flag aligns with non-miss bucket" property test in `useComprehensionSession.test.ts` that fuzzes random (similarity, ms) tuples through both helpers and asserts the hook's `correct` boolean equals `bucket(score) !== 'miss'`.

8. **T-8 — No test for the empty-deck path.** A deck with 0 cards (`total === 0`) keeps `isComplete = false` (the `&& total > 0` guard), the page renders the input form against `currentCard = null`, and `submitResponse` would throw "no current card" if the user tried. No test covers this state. See BugHunt W-2.

## Top three improvements (ranked by impact)

1. **Author the FeedbackPanel render assertion in `ComprehensionSessionPage.test.tsx`.** Pin the 3.5 AC: a `pendingResult` with `bucket: 'close'` should produce visible canned text in the page DOM (`getByText(/nearly|spelling|details/i)`). Two-line addition; closes the largest test-coverage hole.

2. **Author `apps/web/src/pages/CardDetail.test.tsx` smoke + state branches.** Mock supabase + auth, render at `/app/decks/d1/cards/c1`, assert: (a) Loading…, (b) the card body when data resolves, (c) "Card not found" when data is null, (d) error alert on query error, (e) the `<CardComprehensionHistory>` slot is rendered (mock the child to a marker). Closes T-2 + adds defense for the route-mount fix that BugHunt C-1 will land.

3. **Add a re-entrancy guard test to `useComprehensionSession.test.ts`.** Mirror the Phase-2 W-2 fix's pattern: dispatch two `submitResponse` calls back-to-back inside `act`, assert `attemptsInsert` was called once and `pendingResult` reflects only one submission. Forces the implementation to add a `submittingRef`, which closes T-3.

## Blocking findings

**None on critical-path code.** The two F grades land on (a) `CardDetail.tsx` — page is presentational + entirely off the auth/RLS/FSRS critical path, and (b) the routing entry — which is a routing-table bug (BugHunt territory), not a test gap. Per the skill's blocking rule (D/F on auth/RLS/Edge Functions/FSRS/payments blocks the next phase), Phase 3 is **mergeable** by TestAudit's gate.

The combined T-1 + T-2 + T-3 do constitute serious test debt that should be paid down in a phase-3 fix-request before Phase 4 begins, since the comprehension hook is the template Phase 4 will copy for pronunciation.

## Fix-request files generated

- `requests/phase-3-fixes/fix-test-feedback-panel-render-assertion.md` (T-1)
- `requests/phase-3-fixes/fix-test-card-detail-smoke.md` (T-2)
- `requests/phase-3-fixes/fix-test-comprehension-reentrancy-guard.md` (T-3)
