# Fix — `bump_rate_limit` and `insert_ai_deck_with_cards` invoked without user JWT context

**Severity:** Critical (×2 — same root cause). Bughunt Phase-5 Critical-1 + Critical-2.

## Root cause

`bump_rate_limit` (migration `0015_pro_tier_infra.sql`) and `insert_ai_deck_with_cards` (migration `0017_insert_ai_deck_with_cards.sql`) are both `SECURITY DEFINER` and read `auth.uid()` to enforce caller identity. `auth.uid()` is sourced from the JWT carried by the Postgres connection — it does NOT come from the function's definer. The Edge Functions in `supabase/functions/generate-feedback/index.ts:170-176` and `supabase/functions/generate-lesson/index.ts:89-96` + `:125-142` invoke these RPCs through the **service-role** client (`serviceClient.rpc(...)`), which has no user JWT. `auth.uid()` returns NULL → both functions raise `UNAUTHENTICATED` (errcode 42501).

Net effect:
- Every cache-miss `generate-feedback` Pro call returns 500 (`INTERNAL`) to the user.
- Every `generate-lesson` Pro call returns 500.
- Cache-hit `generate-feedback` calls work fine (they short-circuit before the bump RPC).
- `flip-tier` is already wired correctly (uses `userClient(actorJwt)` for the RPC) — proof that the right pattern is already understood.

The handler authors flagged this with `// Tracked in the Phase 5 audit gate` comments at both call sites.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | `bump_rate_limit` is invoked through a user-context Supabase client (anon key + Authorization: Bearer <jwt>) inside both `generate-feedback/index.ts` and `generate-lesson/index.ts`. |
| 2 | `insert_ai_deck_with_cards` is invoked through a user-context client inside `generate-lesson/index.ts`. |
| 3 | A live-Supabase integration test (see `fix-test-edge-fn-integration-suites.md`) covers a successful Pro-user lesson generation end-to-end, confirming a real `decks` row + cards land in Postgres. |
| 4 | Same coverage for a `generate-feedback` cache-miss writing both `feedback_cache` and the source-attempt's `feedback_text`. |
| 5 | The Deno handler-factory tests still pass with the dep signature change. |

## Suggested patch

Two reasonable shapes:

**Option A — bind the JWT into the deps per-request inside `Deno.serve(...)`:**
```ts
Deno.serve((req) => {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const requestDeps: HandlerDeps = {
    ...staticDeps,
    bumpRateLimit: makeBumpRateLimit(env, jwt),
    insertDeckWithCards: makeInsertDeckWithCards(env, jwt),
  };
  return createHandler(requestDeps)(req);
});
```

**Option B — extend the `HandlerDeps` contract to take the JWT explicitly:**
```ts
bumpRateLimit(jwt: string, bucket: string, cap: number): Promise<number>;
insertDeckWithCards(jwt: string, ownerId: string, ...): Promise<string>;
```

Option B is more explicit at the test surface but requires a bigger handler test diff. Option A keeps the handler factory pure.

## Files to touch

- `supabase/functions/generate-feedback/index.ts`
- `supabase/functions/generate-lesson/index.ts`
- `supabase/functions/generate-feedback/handler.test.ts` (only if Option B)
- `supabase/functions/generate-lesson/handler.test.ts` (only if Option B)
- `apps/web/tests/integration/supabase/generate-feedback.test.ts` (NEW — see fix-test-edge-fn-integration-suites.md)
- `apps/web/tests/integration/supabase/generate-lesson.test.ts` (NEW)

## Out of scope

The acceptance-criterion-level rewrite of the `getRecentWeakWords` source coverage (bughunt Medium-1) — separate fix.
