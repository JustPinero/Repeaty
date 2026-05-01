# Fix — Hook-side offline branches lack unit-test coverage

**Severity:** High (test-audit-phase-6 High-1)
**Originating audit:** Phase 6 test-audit
**Discovered:** 2026-04-30

## Root cause

The user-visible critical path of the offline-queue feature is:

1. User rates a card / submits a comprehension answer while offline.
2. The session hook detects offline and calls `enqueueReview` / `enqueueComprehension` instead of the direct supabase write.
3. The local UI advances; the row drains on reconnect.

Step 2 is implemented in:
- `apps/web/src/features/review/useReviewSession.ts:139-152` — `if (navigator.onLine === false)` branch.
- `apps/web/src/features/comprehension/useComprehensionSession.ts:143-153` — same shape.

Neither branch has a unit test. `useReviewSession.test.tsx` (existing) tests the online path; `useComprehensionSession.test.ts` (existing) likewise. A regression that swaps `=== false` for `=== true`, removes the branch, or mis-shapes the enqueue payload lands silent.

The E2E `pwa-install-and-offline.spec.ts` enqueues synthetically via `page.evaluate(() => import('/src/lib/offline-queue.ts'))` — explicitly bypassing the session UI to dodge the deck-list-race that DEBT-006 captures. So the production code path that Ben actually walks is unverified end-to-end too.

## Acceptance criteria

- [ ] `useReviewSession.test.tsx` gains a case: with `navigator.onLine === false`, calling `submitRating(Rating.Good)` invokes `enqueueReview` with the correct shape and does NOT call `supabase.from('reviews').upsert(...)`.
- [ ] `useComprehensionSession.test.ts` gains the symmetric case for `submitResponse`.
- [ ] Both tests assert the local UI state advances (queue.length decrements, reviewedCount/results increment) regardless of online vs offline.
- [ ] Mock `enqueueReview` / `enqueueComprehension` via `vi.mock('@/lib/offline-queue', ...)` so the test is fast and deterministic.

## Files to touch

- `apps/web/src/features/review/useReviewSession.test.tsx`
- `apps/web/src/features/comprehension/useComprehensionSession.test.ts`
