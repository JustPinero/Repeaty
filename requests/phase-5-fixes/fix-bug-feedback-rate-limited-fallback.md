# Fix — `useFeedback` returns `null` text on RATE_LIMITED instead of falling back to canned text

**Severity:** Medium. Bughunt Phase-5 Medium-3.

## Root cause

`apps/web/src/features/feedback/useFeedback.ts:59-71` collapses both transport failures and edge-error-body cases to `return null` and a `console.warn`. That meets the "don't surface a red error" criterion. But when the cause is specifically `RATE_LIMITED`, the user is a Pro who has exhausted their daily AI feedback quota — the canned-text fallback (still curated, locale-aware) would be a noticeably better UX than `null`.

The change is small: branch on `body.error.code === 'RATE_LIMITED'` and return the canned-text lookup that the free-tier path uses.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | When `generate-feedback` returns `RATE_LIMITED` (or supabase-js raises a 429 FunctionsHttpError), `useFeedback` returns `{ text: cannedTextLookup(input), isLoading: false }`. |
| 2 | Other edge-error codes (UPSTREAM_TIMEOUT, UPSTREAM_FAILED, INTERNAL) keep their current behavior of returning `null` (signals "AI feedback unavailable today"). |
| 3 | New unit test in `useFeedback.test.ts` covers the 429 → canned-text branch using a mock that returns `error.code === 'RATE_LIMITED'`. |
| 4 | Existing 429 test (line 125) is updated to reflect the new behavior, OR replaced with a transport-error test. |

## Files to touch

- `apps/web/src/features/feedback/useFeedback.ts`
- `apps/web/src/features/feedback/useFeedback.test.ts`

## Out of scope

A more nuanced UI badge differentiating "rate limited" vs "AI down" vs "no feedback for this attempt" — Phase 6 polish if real-user feedback shows the distinction matters.
