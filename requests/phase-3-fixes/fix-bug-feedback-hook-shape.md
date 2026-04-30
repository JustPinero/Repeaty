# Fix Request — BugHunt W-3: useFeedback is named like a hook but uses no hook calls

## What's wrong
`apps/web/src/features/feedback/useFeedback.ts:27-31`:

```ts
export function useFeedback(input: FeedbackInput): FeedbackResult {
  const prefix = (input.nativeLanguageCode || '').toLowerCase().split('-')[0] ?? 'en';
  const text = lookupFeedback({ bucket: input.bucket, nativeLangPrefix: prefix });
  return { text, isLoading: false };
}
```

The body uses no React hooks (no `useState`, `useMemo`, `useEffect`, `useQuery`). The `use` prefix tells `react-hooks/rules-of-hooks` and Phase-5 maintainers that this is hook-shaped, but today it's just a function. The 3.5 spec promises Phase 5 will rewire to call the `generate-feedback` Edge Function "the public API stays stable" — meaning the body changes from sync function to async TanStack-Query-backed hook.

## Why it matters
- **Phase-5 swap risk.** Today's pure-function callers can be invoked outside React (in unit tests, helpers, memoization wrappers). When Phase 5 introduces `useQuery` inside the body, every non-React caller crashes — and the lint rule won't catch it because the breakage happens at the new hook callsite, not at the existing pure-function callsite.
- **Lint inconsistency.** `react-hooks/rules-of-hooks` doesn't fire on a hook-named function with no hook calls today; it fires the moment the function gains a single `useMemo`. Code that's safely conditional today (e.g. `if (cond) useFeedback(...)`) becomes a lint error post-Phase-5 swap, surprising the maintainer.
- **The fix is trivial.** Bring it inside hook semantics today via a no-op `useMemo`, and Phase 5's swap is a real-hook-to-real-hook change that respects the rules from day one.

## Proposed fix

```ts
import { useMemo } from 'react';
import type { ScoreBucket } from '@repeaty/shared';
import { lookupFeedback } from './canned-text';

export type FeedbackInput = {
  kind: 'comprehension';
  bucket: ScoreBucket;
  targetText: string;
  nativeText: string;
  userResponse: string;
  nativeLanguageCode: string;
};

export type FeedbackResult = {
  text: string | null;
  isLoading: boolean;
};

export function useFeedback(input: FeedbackInput): FeedbackResult {
  const prefix = (input.nativeLanguageCode || '').toLowerCase().split('-')[0] || 'en';
  const text = useMemo(
    () => lookupFeedback({ bucket: input.bucket, nativeLangPrefix: prefix }),
    [input.bucket, prefix],
  );
  return { text, isLoading: false };
}
```

Two improvements bundled in:
1. `useMemo` makes the function hook-shaped; the lint rule now correctly applies.
2. The `?? 'en'` (which was dead code; see Info I-1) becomes `|| 'en'` so it actually fires when the BCP-47 split yields an empty string.

## Files to touch
- `apps/web/src/features/feedback/useFeedback.ts` — add `useMemo` import + wrap the lookup
- `apps/web/src/features/feedback/useFeedback.test.ts` — no test changes needed (the contract is unchanged); confirm all 6 existing tests pass

## Acceptance criteria
- `useFeedback` calls at least one React hook (`useMemo`)
- All 6 existing `useFeedback.test.ts` cases continue to pass
- `react-hooks/rules-of-hooks` lint applies cleanly
- Phase 5's swap to a `useQuery`-backed body is a one-file replacement of the `useMemo` block; no caller code changes
