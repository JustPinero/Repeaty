# Fix — useDueCards.test.ts mocks only one of two `from('reviews')` calls

## What's missing
`apps/web/src/features/dashboard/useDueCards.test.ts` mocks the `from('reviews')` chain exclusively in the `.eq().lte()` shape. The hook actually invokes `from('reviews')` twice:
- `useDueCards.ts:64-67` — `.from('reviews').select('card_id').eq('user_id', userId).lte('due_at', nowIso)` — returns *due* card ids.
- `useDueCards.ts:75-78` — `.from('reviews').select('card_id').eq('user_id', userId)` — returns *all reviewed* card ids (no `.lte()`).

The mock for `'reviews'` always returns the `.eq().lte()` chain. The "all reviewed" call therefore lands on a chain whose `.eq()` returns an object with `.lte()` (which is never called), and the test's `await` resolves to whatever the chain happens to expose. The "happy path" test passes coincidentally because the same `dueReviews` mock is used for both invocations — but in production these resolve to different sets, and the test cannot detect a divergence.

## Why it matters
The dashboard's primary CTA — "Start review — Spanish — Starter (A1)" — depends on `useDueCards` aggregating new vs due correctly. The current test asserts `totalDue=1, totalNew=4` against a deck-card layout where 1 review row is due and 0 review rows exist outside that. If the hook ever returns the wrong set from the second call (e.g. accidentally matches due rows again, double-counting cards as "not new" when they are), the test continues to pass. This is a silent-failure surface in critical-path code (the hook drives the user's primary flow into Phase 2's review session).

## Proposed test
Refactor `fromMock` for `'reviews'` to dispatch on the chain shape:

```ts
if (table === 'reviews') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        // Branch 1: .eq('user_id').lte('due_at') → due rows only.
        lte: vi.fn().mockResolvedValue({ data: dueReviews, error: null }),
        // Branch 2: .eq('user_id') awaited directly → all reviewed rows.
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: allReviewedReviews, error: null }),
      }),
    }),
  };
}
```

The test cases:

```ts
it('counts new cards as cards with no review row at all (not just non-due)', async () => {
  // 5 cards: c-es-1 due, c-es-2 reviewed-but-future-due, c-fr-1/c-fr-2/c-fr-3 never reviewed.
  const dueReviews = [{ card_id: 'c-es-1' }];
  const allReviewedReviews = [{ card_id: 'c-es-1' }, { card_id: 'c-es-2' }];
  // ... mock setup as above
  const { result } = renderHook(() => useDueCards(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.totalDue).toBe(1);
  // 5 total - 2 reviewed = 3 new.
  expect(result.current.totalNew).toBe(3);
});

it('handles cards reviewed but not due — neither new nor due (counted in neither)', async () => {
  // 2 cards: both reviewed; one is due, the other is in the future.
  const dueReviews = [{ card_id: 'c1' }];
  const allReviewedReviews = [{ card_id: 'c1' }, { card_id: 'c2' }];
  // expect totalDue=1, totalNew=0
});
```

Also assert that `from('reviews')` is invoked exactly twice (one for `.lte()` chain, one without).

## Files to touch
- `apps/web/src/features/dashboard/useDueCards.test.ts` — refactor mocks + add two new cases.

## Acceptance criteria
- The mock distinguishes the two `.from('reviews')` shapes; the all-reviewed call returns a set distinct from the due call.
- A new test asserts that "reviewed-but-not-due" cards count as neither due nor new.
- A new test asserts that cards with no review row count as new.
- Mutating `useDueCards.ts:88` from `else if (!reviewedCardIds.has(card.id))` to (incorrect) `else if (!dueCardIds.has(card.id))` causes the new test to fail.
