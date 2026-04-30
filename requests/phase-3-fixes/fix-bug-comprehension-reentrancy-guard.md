# Fix Request — BugHunt W-1: useComprehensionSession re-entrancy guard

## What's wrong
`useComprehensionSession.submitResponse` (`apps/web/src/features/comprehension/useComprehensionSession.ts:102-150`) has no internal guard against concurrent invocations. Two calls in flight at once both capture the same `currentCard` from closure and both fire `comprehension_attempts.insert` — one card produces two attempt rows. The `pendingResult` is set twice, advancing the UX inconsistently.

The page (`ComprehensionSessionPage.tsx:26, 39-46`) wraps with a `submitting` boolean, so today's user-click path is safe — but the hook contract is exposed without internal guard. Phase-2 W-2 noted the same gap on `useReviewSession` and was fixed in chore(3.0) by adding a `submittingRef`. The fix's own comment block (`useReviewSession.ts:110-113`) explicitly anticipated this case: "for any future caller (offline replay loop in Phase 6, **auto-rate-on-timeout for comprehension mode**, etc.)".

## Why it matters
- **Phase 4 copies this pattern.** Pronunciation will use the same hook shape; if comprehension ships without the guard, Phase 4's pronunciation hook will inherit the bug and need the same fix.
- **Phase 5 timer.** When auto-submit-on-timeout lands (per the comment in the review fix), every callsite would have to re-implement the guard. Better to put it where it belongs.
- **Defense in depth.** RLS doesn't help here — the duplicate inserts are correctly authorized; they just shouldn't have happened. The fix is at the application layer.

## Proposed fix

In `apps/web/src/features/comprehension/useComprehensionSession.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
// ...

export function useComprehensionSession(deckId: string): ComprehensionSessionState {
  // ... existing
  const cardStartedAt = useRef<number>(Date.now());
  const submittingRef = useRef(false); // ← NEW

  // ... existing useEffect

  const submitResponse = useCallback(
    async (response: string): Promise<CardResult> => {
      if (!currentCard) throw new Error('no current card');
      if (!userId) throw new Error('not authenticated');
      if (submittingRef.current) {
        throw new Error('submission in flight');
      }
      submittingRef.current = true;
      try {
        // existing body unchanged: trim, similarity, score, insert, setPendingResult, return
      } finally {
        submittingRef.current = false;
      }
    },
    [currentCard, userId],
  );
  // ...
}
```

Choice point: throw vs silently return. Review uses silent return; comprehension is fine throwing because the page wraps with `try/finally` already.

## Files to touch
- `apps/web/src/features/comprehension/useComprehensionSession.ts` — add `submittingRef` and the guard

## Acceptance criteria
- A test (see `requests/phase-3-fixes/fix-test-comprehension-reentrancy-guard.md`) firing two concurrent `submitResponse` calls produces exactly one `comprehension_attempts.insert` call
- The second call rejects with a clear error message
- All 10 existing `useComprehensionSession.test.ts` cases continue to pass
- The page's `submitting` boolean still prevents user-side double-clicks (no UX regression)
