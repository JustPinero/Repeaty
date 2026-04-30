# Fix Request — TestAudit T-3: useComprehensionSession re-entrancy guard test

## What's missing
`useComprehensionSession.submitResponse` has no internal re-entrancy guard, and no test asserts protection against double-submit. Phase-2 finding W-2 noted the same gap on `useReviewSession` and was fixed in chore(3.0) by adding a `submittingRef`. The fix's own comment block explicitly mentions comprehension as a future caller that benefits — but the new comprehension hook didn't carry the pattern.

## Why it matters
- A user pressing Enter twice in quick succession on the input form (or, worse, the Phase-5 auto-submit-on-timeout pathway when it lands) issues two `comprehension_attempts` inserts, computes `responseMs` twice, and double-counts the response in the running results array.
- The page mitigates with a `submitting` boolean (`ComprehensionSessionPage.tsx:26-46`), but the hook contract is exposed without internal guard. Any future caller that forgets the wrapper hits the race.
- Phase 4 will copy this hook's pattern for pronunciation. Pinning the contract now prevents the same bug from being copied forward.

## Proposed fix

### Implementation (in `useComprehensionSession.ts`)

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
// ...

const submittingRef = useRef(false);

const submitResponse = useCallback(
  async (response: string): Promise<CardResult> => {
    if (!currentCard) throw new Error('no current card');
    if (!userId) throw new Error('not authenticated');
    if (submittingRef.current) {
      // Already submitting — return the in-flight result rather than firing
      // a second insert. (Caller-friendly: matches the page's expectation
      // that submitResponse always resolves.)
      throw new Error('submission in flight');
    }
    submittingRef.current = true;
    try {
      // existing body (similarity, score, insert, setPendingResult, return result)
    } finally {
      submittingRef.current = false;
    }
  },
  [currentCard, userId],
);
```

Choice point: throw vs silently return the existing pendingResult. The review-session pattern silently returns; for comprehension, throwing is fine because the page wraps with `try/finally` already.

### Test (in `useComprehensionSession.test.ts`)

```ts
it('ignores re-entrant submitResponse calls while the first is in flight', async () => {
  cardsResult.mockResolvedValue({ data: cards, error: null });
  let resolveInsert: (v: { error: null }) => void = () => {};
  attemptsInsert.mockImplementationOnce(
    () => new Promise<{ error: null }>((r) => { resolveInsert = r; }),
  );
  const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  let firstPromise: Promise<CardResult> | undefined;
  let secondError: Error | null = null;
  await act(async () => {
    firstPromise = result.current.submitResponse('hello');
    try {
      await result.current.submitResponse('hello');
    } catch (err) {
      secondError = err as Error;
    }
    await Promise.resolve();
  });

  // Only one insert kicked off.
  expect(attemptsInsert).toHaveBeenCalledTimes(1);
  expect(secondError).toBeInstanceOf(Error);

  await act(async () => {
    resolveInsert({ error: null });
    await firstPromise;
  });
  expect(result.current.pendingResult?.cardId).toBe('c1');
});
```

## Files to touch
- `apps/web/src/features/comprehension/useComprehensionSession.ts` — add `submittingRef`
- `apps/web/src/features/comprehension/useComprehensionSession.test.ts` — add the test above

## Acceptance criteria
- Two concurrent `submitResponse` calls within `act` produce exactly one `attemptsInsert` call
- The second call's promise rejects (or, if the silent-return option is chosen, resolves to the same `CardResult`)
- `progress.reviewed` is unaffected (incremented only by `next()`, but the underlying `pendingResult` reflects exactly one submission)
- All 10 existing `useComprehensionSession.test.ts` cases continue to pass
