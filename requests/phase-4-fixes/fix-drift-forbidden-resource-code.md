# Fix — `FORBIDDEN_TIER` should not double-duty as the path-traversal denial code

**Source audit:** DriftAudit Phase 4 (api-contracts.md vs handler.ts) + BugHunt I-1
**Severity:** Warning — semantic clarity; not a security regression

## Problem

`references/api-contracts.md:24` defines:
- `403` — "Authenticated but not authorized (e.g. free user hitting Pro fn)"

The shared error enum includes `FORBIDDEN_TIER` (line 31). `supabase/functions/score-pronunciation/handler.ts:144` uses `FORBIDDEN_TIER` for path-prefix violations — *not* a tier denial. The handler's own test acknowledges the mismatch:

```ts
// handler.test.ts:120-122
// FORBIDDEN_TIER is the closest semantic match in the shared enum even though
// this is path-traversal, not tier — handler maps to it deliberately.
assertEquals(body.error.code, 'FORBIDDEN_TIER');
```

A Phase-5 caller invoking `score-pronunciation` and seeing a `FORBIDDEN_TIER` error will reasonably assume "user is free, needs to upgrade", not "audio path is wrong".

## Why it matters

- Two distinct 403 conditions get conflated into one error code, defeating the point of having concrete codes (the api-contracts doc opted for codes-not-status precisely so callers can branch on intent).
- Phase 5's `generate-lesson` / `generate-feedback` actually *will* return `FORBIDDEN_TIER` for free users hitting Pro endpoints. When that ships, callers seeing `FORBIDDEN_TIER` from `score-pronunciation` and from `generate-lesson` will need request-context to disambiguate — that's exactly what the code is supposed to remove.

## Proposed fix — preferred path

Add a `FORBIDDEN_RESOURCE` code to the shared enum, mapped to 403, used for cross-resource denial. Use it in `score-pronunciation` for the path-prefix violation. Keep `FORBIDDEN_TIER` for tier denial.

Steps:

1. **Update both copies of the enum** (drift-audit watches them):
   - `packages/shared/src/edge-errors.ts`:
     ```ts
     export const EDGE_ERROR_CODES = [
       'INVALID_PAYLOAD',
       'UNAUTHENTICATED',
       'FORBIDDEN_TIER',
       'FORBIDDEN_RESOURCE',
       'NOT_FOUND',
       'RATE_LIMITED',
       'UPSTREAM_TIMEOUT',
       'UPSTREAM_FAILED',
       'INTERNAL',
     ] as const;

     export const EDGE_ERROR_HTTP_STATUS: Record<EdgeErrorCode, number> = {
       INVALID_PAYLOAD: 400,
       UNAUTHENTICATED: 401,
       FORBIDDEN_TIER: 403,
       FORBIDDEN_RESOURCE: 403,
       NOT_FOUND: 404,
       RATE_LIMITED: 429,
       UPSTREAM_TIMEOUT: 504,
       UPSTREAM_FAILED: 502,
       INTERNAL: 500,
     };
     ```
   - `supabase/functions/_shared/edge-errors.ts` — same change byte-for-byte (drift-audit verifies).

2. **Update the handler:**
   ```ts
   // handler.ts:137-148
   if (segments[0] !== user.id || segments.length < 3) {
     return finalize({
       ...,
       result: jsonError(
         'FORBIDDEN_RESOURCE',
         'audio_storage_path must be of the form `${user_id}/${card_id}/<file>`',
       ),
     });
   }
   ```

3. **Update the test:**
   ```ts
   // handler.test.ts:122
   assertEquals(body.error.code, 'FORBIDDEN_RESOURCE');
   ```

4. **Update the api-contracts.md error-code listing:**
   ```
   INVALID_PAYLOAD | UNAUTHENTICATED | FORBIDDEN_TIER | FORBIDDEN_RESOURCE | NOT_FOUND |
   RATE_LIMITED | UPSTREAM_TIMEOUT | UPSTREAM_FAILED | INTERNAL
   ```
   And add a row to the status table at line 24:
   ```
   | 403    | Authenticated but not authorized to perform this action (tier OR resource) |
   ```
   With the codes section noting `FORBIDDEN_TIER` for tier-gated denial and `FORBIDDEN_RESOURCE` for cross-resource denial.

## Files to touch

- `packages/shared/src/edge-errors.ts`
- `supabase/functions/_shared/edge-errors.ts`
- `supabase/functions/score-pronunciation/handler.ts`
- `supabase/functions/score-pronunciation/handler.test.ts`
- `references/api-contracts.md`

## Acceptance criteria

- [ ] Both Node + Deno enums include `FORBIDDEN_RESOURCE` mapped to 403.
- [ ] `score-pronunciation` returns `FORBIDDEN_RESOURCE` for path-prefix violations.
- [ ] `score-pronunciation` would still return `FORBIDDEN_TIER` if it ever became tier-gated (it isn't today, but the door stays open).
- [ ] `references/api-contracts.md` documents both codes.
- [ ] Drift-audit Phase 5 confirms the Node + Deno copies are still in lockstep.
