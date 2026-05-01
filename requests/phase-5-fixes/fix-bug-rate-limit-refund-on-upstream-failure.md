# Fix — Rate limit not refunded on upstream Anthropic failure

**Severity:** High. Bughunt Phase-5 High-2.

## Root cause

`generate-feedback/handler.ts:241-266` and `generate-lesson/handler.ts:180-202` bump the rate-limit counter **before** calling Claude (correct, prevents retry-storm DoS). When Claude rejects with `UPSTREAM_TIMEOUT` (AbortError), `UPSTREAM_FAILED` (network or Anthropic 5xx), or returns malformed JSON, the rate-limit count stays bumped. A user who hits a single transient Anthropic 503 silently loses one of their 10 daily lesson quota with no result.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | A new `bump_rate_limit_decrement(p_bucket text)` SECURITY DEFINER RPC that decrements today's count for `(auth.uid(), p_bucket, current_date)` by 1 (clamped at 0). |
| 2 | `generate-feedback/handler.ts` and `generate-lesson/handler.ts` call the decrement RPC inside the catch block when the failure code is `UPSTREAM_TIMEOUT` or transport-level `UPSTREAM_FAILED` (Anthropic 5xx) — but NOT when the failure is `UPSTREAM_FAILED` from Zod-parse (the user got a model-side issue and is likely to retry, so the budget should still tick). |
| 3 | Decrement failures are logged as a warning but do not promote the original error code. |
| 4 | Integration test seeds 9 successful calls, then mocks an Anthropic 503 on the 10th, asserts the bucket count stays at 9 after the failed call. |
| 5 | Handler unit tests cover: (a) Zod-parse failure does not refund, (b) AbortError refunds, (c) Anthropic 5xx refunds, (d) decrement failure does not change the user-facing error. |

## Files to touch

- `supabase/migrations/0019_bump_rate_limit_decrement_rpc.sql` (NEW)
- `supabase/functions/generate-feedback/handler.ts`
- `supabase/functions/generate-lesson/handler.ts`
- `supabase/functions/generate-feedback/index.ts`
- `supabase/functions/generate-lesson/index.ts`
- `supabase/functions/generate-feedback/handler.test.ts`
- `supabase/functions/generate-lesson/handler.test.ts`
- `apps/web/tests/integration/supabase/bump-rate-limit-rpc.test.ts` — add decrement coverage.
- `references/schema.md` § RPCs — document the decrement RPC.
- `references/api-contracts.md` — note the refund policy in both function flow descriptions.

## Out of scope

Cross-Edge-Function global rate limit (`bucket = 'global'`) — `references/deployment-landmines.md` mentions it but it's not yet wired; that's a Phase 6 ops concern.
