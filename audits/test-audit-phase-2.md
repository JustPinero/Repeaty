# TestAudit — Phase 2 (Flashcards & SRS)

Mode: quick. Scope: files modified between `main` and `phase-2-flashcards` HEAD (13 commits).

## Overall grade: **B+**

The FSRS scheduler is comprehensively tested in `packages/shared/src/fsrs.test.ts` (every acceptance criterion mapped, including determinism, causality, monotonic intervals, mature-card lapse). The platform abstraction has good mock-driven coverage including the no-SpeechSynthesis branch. The integration suite for bundled decks covers seeding, RLS read-through, content shape, and greetings — all on a live Supabase. The session orchestration layer (`useReviewSession`, `RatingButtons`, `ReviewSessionPage`) has all happy-path coverage plus error paths.

Two material gaps remain: (1) the seed-script determinism test — explicitly listed as `seed-decks.test.ts` in Request 2.1's RED-phase — was never authored. The acceptance criterion ("`pnpm seed:decks` regenerates the migration deterministically — running the script twice produces byte-identical SQL output") is therefore unverified. (2) `useDueCards.test.ts` mocks only one of the two `from('reviews')` calls correctly. The second `.eq()` (without `.lte()`) returns a chain whose final value is `undefined`, so when the queryFn awaits it the test would either silently pass against incorrect behavior or never exercise the "all reviewed" branch. The "counts due reviews + new" assertion happens to land on correct values because the mock returns `{data: dueReviews}` for both `.eq().lte()` and the second call would resolve to whatever's at the end of the chain. The test should explicitly mock both `from('reviews')` invocations as the production code makes both round-trips.

E2E coverage exists for the full flashcard review flow (signup → onboarding → start review → rate 3 cards → progress counter advances). The flow is in `flashcard-review-session.spec.ts` and listed `complete` in the manifest.

## Per-area grades

| Area                                       | Grade | Notes                                                                                                  |
| ------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------ |
| FSRS scheduler (`packages/shared/src/fsrs.ts`) | A     | All 9 ACs mapped. Determinism, causality, monotonicity, mature-lapse, JSON round-trip — all asserted   |
| FSRS rating type narrowing                  | A     | Literal-union typing enforced by `Rating` const + tests use `Rating.Again` etc.                        |
| Seed script (`scripts/seed/seed-decks.ts`) | F     | `seed-decks.test.ts` was specified in Request 2.1's RED phase but never authored. Determinism unverified |
| Bundled decks (integration)                | A     | All seven assertions covered. RLS read-through, content shape, greetings, card count                   |
| Bundled-deck idempotency                   | C     | Acceptance criterion ("re-running migrations produces no duplicates") not directly asserted in `bundled-decks.test.ts` — relies on the migration's `on conflict (id) do update` clause |
| Platform abstraction (`web.ts`)            | A     | canSpeak true/false, lang propagation, rate, onend resolve, onerror reject, cancel — covered           |
| Flashcard component                        | A     | Reveal toggle, keyboard reveal, example sentences, reset on next card, Play visibility (3 branches), Play click — covered |
| DeckListItem                               | A     | Name, count, level badge, source badge, route href — covered                                           |
| DeckListPage (orchestrator)                | B     | Tests-after escape applied. Heading, list, empty, error+Retry covered. Suspense / loading state not pinned. The query's `cards(count)` contract is mocked; if Supabase changes shape the hook breaks silently in prod but tests still pass |
| RatingButtons                              | A     | Renders all four, keyboard-tabbable, click → onRate, 1/2/3/4 keyboard, disabled. Strong                |
| useReviewSession (hook)                    | B     | Loading→first-card, advance on Good, re-enqueue on Again (full cycle), upsert payload shape, error path. Missing: query refetch behavior on user change; concurrent submitRating guard not tested at hook level (page guards via `submitting`) |
| ReviewSessionPage (orchestrator)           | B     | Tests-after escape applied. Loading/error/empty/complete + reveal-then-Good covered. Missing: cancel-speech on unmount; `submitting` re-entry guard not tested |
| useDueCards (hook)                         | C     | Empty + populated + error covered. Mock chain for the second `from('reviews').eq()` (the all-reviewed query) is incomplete — the test suite passes coincidentally because the chain mock returns the same mock data. See finding #2 |
| ReviewQueue                                | A     | Loading, empty, populated+top-deck, error — all covered                                                |
| E2E flashcard-review-session               | A     | Full happy path: signup → onboard → start review → rate 3 → progress counter. Drives every layer       |
| Button + Card primitives                   | C     | No dedicated unit tests for shadcn primitives. Acceptable for stateless-presentational; consumers exercise them |
| utils.ts (`cn`)                            | C     | No test. One-liner utility; low risk                                                                   |

## Specific findings

1. **`scripts/seed/seed-decks.test.ts` was never authored.** Request 2.1's acceptance matrix lists "running the script twice produces byte-identical SQL output" as `seed-decks.test.ts`. The file does not exist. The determinism guarantee is the entire point of UUIDv5 over UUIDv4, and is the load-bearing reason `pnpm seed:decks` is safe to re-run. Without the test, a regression where (e.g.) someone uses `Date.now()` in the migration header or stops sorting the deck specs slips through.
2. **`useDueCards.test.ts:140-156` — `from('reviews')` chain is mocked only for the `.eq().lte()` shape.** The hook also calls `from('reviews').select('card_id').eq('user_id', userId)` with no `.lte()`. The third "error path" test's fallback mock has both `.eq().lte()` and `.in()`, but the second-`.eq()`-only path returns the `.eq().lte()` chain — the test happens to pass because it errors on the first `.eq()` call before reaching the second. The "happy path" test has the same gap; it passes because both calls return the same `dueReviews` mock data, but if the all-reviewed call resolves differently in production the test wouldn't catch it.
3. **Bundled-decks integration suite does not directly assert idempotency.** The 2.1 acceptance criterion "Re-running migrations is idempotent (no duplicates)" relies on the SQL's `on conflict (id) do update` clause. The integration suite asserts that one row exists per (lang, source, level) but does not re-apply the migration mid-test and re-count. Acceptable in practice (migration tooling enforces single-application within a run), but the explicit guarantee is unverified.
4. **`useReviewSession` does not test concurrent-submit guarding at the hook level.** The page wraps `submitRating` with a `submitting` boolean, but the hook itself accepts re-entry. If a future caller forgets the wrapper, two parallel submits can both compute against the stale `head` from the closure (the `setQueue` updater is correct, but the upsert payload races). The page test covers the wrapper; the hook test should pin the hook contract.
5. **`Flashcard.test.tsx` does not verify `cancelSpeech` is called on unmount or card change.** The component has a cleanup effect on `[targetText]`. If a future refactor drops the dependency or the cleanup, in-flight TTS will continue speaking the previous card while the next is shown.
6. **No test for `useDueCards`'s "topDeck has 0/0 → null" branch (lines 117-119).** Edge case in the empty-deck-with-reviews scenario.
7. **`ReviewSessionPage` — the `submitting` re-entry guard is not unit-tested.** The page avoids double-submits via `if (submitting) return`. A test could click Good twice rapidly and assert `submitRating` was called once.
8. **No explicit test for `OnboardingGuard.refetch()` on the new Retry button** introduced via the Phase-1 fix. (Existence is covered, behavior is not.) Low priority.

## Top three improvements (ranked by impact)

1. **Author `scripts/seed/seed-decks.test.ts`** that runs `generateMigrationSql(specs)` twice on the same input and asserts byte-equality, plus runs it on a synthetic 2-deck spec and snapshots the output for regression detection. This is the missing RED test from Request 2.1.
2. **Fix the `useDueCards.test.ts` mock chain** to explicitly mock both `from('reviews')` invocations (one with `.eq().lte()`, one with just `.eq()`) and assert both are called with the right args. As-is, the test gives false confidence that production-shape behavior matches.
3. **Add a determinism guard to the FSRS test suite for the JSONB serialization contract** — currently `serialization round-trip` covers `JSON.parse(JSON.stringify(...))`, but not the upsert-shape contract from `useReviewSession.ts:104-115` (the four denormalized columns must always come from the FSRS state). This isn't strictly a TestAudit gap (it's a system-level integration concern), but a small test in `useReviewSession.test.ts` checking that the upsert payload's `due_at`, `interval_days`, and `last_reviewed_at` always match `fsrs_state.due`, `.scheduled_days`, and `.last_review` respectively would close the schema-drift hole.

## Blocking findings

None. The seed-script determinism gap (finding #1) is grade F on a non-critical-path file. The useDueCards mock gap (finding #2) is grade C on critical-path-adjacent code (the dashboard's primary CTA). Neither sits on auth, RLS, or FSRS scheduling, so per the skill's blocking rule, the phase is mergeable.

The FSRS scheduler — the one piece of code in this phase that classifies as critical-path — is grade A.

## Fix-request files generated

- `requests/phase-2-fixes/fix-test-seed-script-determinism.md`
- `requests/phase-2-fixes/fix-test-due-cards-mock-chain.md`
- `requests/phase-2-fixes/fix-test-bundled-decks-idempotency.md`
