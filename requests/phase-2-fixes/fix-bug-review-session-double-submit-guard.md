# Fix — `useReviewSession.submitRating` needs internal concurrency guard

## What's wrong
`apps/web/src/features/review/useReviewSession.ts:95-126` — `submitRating` reads `queue[0]` from its closure, awaits a network upsert, then calls `setQueue`. If two ratings are submitted in flight (rapid clicks, keyboard race, or a future caller that doesn't wrap with a `submitting` flag), both invocations:
1. Capture the same `head` (closure value at call time).
2. Issue the same upsert against the same `card_id` with slightly different `now` timestamps.
3. Both call `setReviewedCount((c) => c + 1)` — which is fine functionally but counts the same card twice.
4. Race on the `setQueue` updaters; the second updater sees the first updater's result, so the queue ends up with `rest.slice(1)` of an already-sliced array. The user advances by two positions in the queue from a single card review.

The page (`ReviewSessionPage.tsx:11-21`) wraps with `if (submitting) return; setSubmitting(true); …`, which masks the bug today. But the hook's contract should not depend on the caller; another consumer (offline-replay loop in Phase 6, future Stats panel that auto-rates timed-out cards, etc.) will hit this.

## Why it matters
- **Correctness on the FSRS state path.** Two upserts for the same card with different `now` timestamps produce divergent `fsrs_state` blobs, and Postgres applies them in arrival order. The "second-applied wins" semantics is correct for FSRS, but the second `schedule(...)` reads the *unchanged* original state — so the second upsert undoes the first's interval bump. Card scheduling regresses to "as if rated once" while two `reviews` rows of credit accumulate in `progress.reviewed`.
- **Phase 6 offline replay** — when Dexie replays queued ratings on reconnect, multiple ratings for the same card need to be applied sequentially against the latest server state. The hook currently has no guarantee that `submitRating` returns before the next call's read of `queue[0]` is consistent.

## Proposed fix
Add an internal `useRef` lock:

```ts
const submittingRef = useRef(false);
const submitRating = useCallback(async (rating: Rating) => {
  if (!userId) return;
  if (submittingRef.current) return;
  submittingRef.current = true;
  try {
    const head = queue[0];
    if (!head) return;
    // ... existing logic
  } finally {
    submittingRef.current = false;
  }
}, [userId, queue]);
```

Tests:
```ts
it('ignores re-entrant calls while a submission is in flight', async () => {
  cardsResult.mockResolvedValue({ data: cards, error: null });
  reviewsResult.mockResolvedValue({ data: [], error: null });
  let resolveUpsert: (v: unknown) => void = () => {};
  upsertResult.mockImplementation(() => new Promise((r) => { resolveUpsert = r; }));
  const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  // Fire two submits before the first resolves.
  let firstPromise: Promise<void> | undefined;
  let secondPromise: Promise<void> | undefined;
  await act(async () => {
    firstPromise = result.current.submitRating(Rating.Good);
    secondPromise = result.current.submitRating(Rating.Good);
  });

  // Only one upsert should have been kicked off.
  expect(upsertResult).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveUpsert({ error: null });
    await firstPromise;
    await secondPromise;
  });

  expect(result.current.progress.reviewed).toBe(1);
});
```

## Files to touch
- `apps/web/src/features/review/useReviewSession.ts` — add `useRef`-based guard.
- `apps/web/src/features/review/useReviewSession.test.ts` — add re-entrancy test.
- `apps/web/src/features/review/ReviewSessionPage.tsx` — the `submitting` boolean can stay (it's the right UX signal for the buttons); the hook-level guard is defense-in-depth.

## Acceptance criteria
- Calling `submitRating` twice in the same tick (before the first await resolves) results in exactly one upsert call.
- `progress.reviewed` increments by exactly 1 per completed `submitRating`, never by 2 from a concurrent call.
- The page-level test for the existing `submitting` UX guard continues to pass.
