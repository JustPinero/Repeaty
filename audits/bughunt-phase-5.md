# Bug Hunt — Phase 5

Attack-surface review of the diff `git diff --name-only main...HEAD` (75 files). Phase 5 introduces three new Edge Functions, four new SQL routines (two SECURITY DEFINER), an admin route, and a Pro-gated client surface.

## Summary

| Severity   | Count |
| ---------- | ----- |
| Critical   | 2     |
| High       | 2     |
| Medium     | 3     |
| Low        | 2     |

## Critical

### Critical-1 — `bump_rate_limit` is invoked from the SERVICE-ROLE client and will always raise UNAUTHENTICATED

**Files:** `supabase/functions/generate-feedback/index.ts:170-176`, `supabase/functions/generate-lesson/index.ts:89-96`, `supabase/migrations/0015_pro_tier_infra.sql:99-104`

The migration body for `bump_rate_limit` reads:

```sql
declare
  v_user_id uuid := auth.uid();
…
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
```

`bump_rate_limit` is `SECURITY DEFINER`, but `auth.uid()` is sourced from the JWT carried by the calling Postgres connection — it does **not** come from the function's definer. When the Edge Function calls the RPC through `serviceClient.rpc('bump_rate_limit', …)` (the service-role connection has no user JWT), `auth.uid()` returns NULL and the RPC raises `UNAUTHENTICATED`.

The handler then maps this raise into the `INTERNAL` branch (the message doesn't match `/RATE_LIMITED/`), so every Pro-tier `generate-feedback` cache-miss and every `generate-lesson` call returns 500 to the user. `flip-tier` already binds the user JWT correctly via `userClient(actorJwt)` (see `supabase/functions/flip-tier/index.ts:46`); the same fix applies here.

The handler authors flagged this with comments — `generate-feedback/index.ts:162-169` ("Tracked in the Phase 5 audit gate") and `generate-lesson/index.ts:127-132`. Both `bumpRateLimit` and `insertDeckWithCards` need the user JWT plumbed through the dep contract.

**Repro:** any successful Pro tier call to `generate-feedback` (cache miss) or `generate-lesson`. The handler tests don't catch this because they mock `bumpRateLimit` directly; the missing live integration tests (test-audit High-1) would have caught it.

**Fix sketch:**
1. Add `actorJwt` (or `userClient: SupabaseClient`) to `HandlerDeps.bumpRateLimit` — either as an extra arg or by binding it in the per-request closure inside `Deno.serve` (cleaner: have `index.ts` build a per-request `deps` factory).
2. Same for `insertDeckWithCards` — `auth.uid()` inside `insert_ai_deck_with_cards` rejects with `UNAUTHENTICATED` for the same reason.
3. Update Deno handler tests so the mocked `bumpRateLimit` is invoked with the JWT-bound shape.

→ Fix request: `requests/phase-5-fixes/fix-bug-edge-fn-rpc-auth-context.md`

### Critical-2 — `insert_ai_deck_with_cards` is called from the SERVICE-ROLE client and will always raise UNAUTHENTICATED

**Files:** `supabase/functions/generate-lesson/index.ts:125-142`, `supabase/migrations/0017_insert_ai_deck_with_cards.sql:23-31`

```sql
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if v_actor is distinct from p_owner then
    raise exception 'OWNER_MISMATCH' using errcode = '42501';
  end if;
```

Same root cause as Critical-1: `serviceClient.rpc('insert_ai_deck_with_cards', …)` has no user JWT; `auth.uid()` is NULL; the function raises. Even if Critical-1's rate-limit bump is bypassed (e.g. via the cache-hit branch in `generate-feedback`, which makes Critical-1 dormant for that path), `generate-lesson` always reaches `insertDeckWithCards` after a successful Claude call. So the function never persists a deck in production today.

Same fix as Critical-1.

→ Same fix request: `requests/phase-5-fixes/fix-bug-edge-fn-rpc-auth-context.md`

## High

### High-1 — AdminPage cannot list other users' profiles under RLS

**File:** `apps/web/src/features/admin/AdminPage.tsx:30-39`, `supabase/migrations/0006_rls_policies.sql:14-17`

The `profiles` SELECT RLS policy is:
```sql
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);
```

`AdminPage` calls `supabase.from('profiles').select(…).order(…).limit(50)` through the user-context client. Even an admin user only sees their own row — the page renders with one card (themselves), the cycle button is disabled (self-flip guard), and the page is functionally inert.

The `AdminPage.test.tsx` mock returns multiple rows side-stepping the RLS check, which is why the unit suite is green. To list other profiles, admins need either:
- An `is_admin` arm in the `profiles_select_own` policy (e.g. `using (auth.uid() = id OR exists(select 1 from profiles where id = auth.uid() and is_admin))`), or
- A SECURITY DEFINER `list_admin_profiles()` RPC that returns the rollup, or
- Routing the read through an Edge Function that uses the service-role client + admin-check (similar to the `tier_change_log` SELECT pattern).

→ Fix request: `requests/phase-5-fixes/fix-bug-admin-page-rls-list.md`

### High-2 — Rate-limit counter increments before the Anthropic call but is not refunded on upstream failure

**Files:** `supabase/functions/generate-feedback/handler.ts:241-266` (bump) `→ 290-315` (callClaude), `supabase/functions/generate-lesson/handler.ts:180-202` (bump) `→ 213-237` (callClaude)

The bump happens before the fetch — that's the right order to prevent retry-storms (DoS-defense). But when the Anthropic API rejects (5xx, network error, malformed-JSON, AbortError), the count stays bumped. A user who hits a single transient Anthropic 503 has their daily quota silently decremented with no result. With 10 lessons/day cap and Anthropic's occasional 5xx weather, this is user-facing.

Two acceptable mitigations:
1. **Refund-on-upstream-failure:** add a service-role decrement RPC (`bump_rate_limit_decrement(p_bucket text)`) that the handler calls inside the Anthropic catch block when the failure is `UPSTREAM_TIMEOUT` / `UPSTREAM_FAILED` / Anthropic 5xx. Don't refund on `UPSTREAM_FAILED` from Zod-parse — that's a model-side issue users will retry anyway.
2. **Bump-after-success:** flip the order — call Claude first, bump only on a complete persisted result. Risk: a Pro user in a tight loop can flood the API up to (concurrent_requests × N) before the limit kicks in.

Option 1 is the conventional answer and matches the request brief ("counted against the daily rate limit").

→ Fix request: `requests/phase-5-fixes/fix-bug-rate-limit-refund-on-upstream-failure.md`

## Medium

### Medium-1 — `generate-lesson` weak-words query is comprehension-only and post-filters language client-side

**File:** `supabase/functions/generate-lesson/index.ts:64-87`

The `getRecentWeakWords` impl queries `comprehension_attempts` only. The api-contracts.md spec says "recent weak words from `reviews + pronunciation_attempts + comprehension_attempts`". The implementation:
- Misses pronunciation weak words (low similarity_score) entirely.
- Misses FSRS review-rated `Again` cards entirely.
- Filters by language client-side (`if (row.cards.language_code !== languageCode) continue`) after pulling `limit * 2` rows. For a user whose comprehension history skews to a different language, the function may return zero weak words even when their target-language history has plenty.

Functionally this means the personalization feature pulls from a thin slice of the available signal — quality, not security. Fold the language filter into the SQL `eq()` and union all three sources via a SQL view or RPC.

→ Fix request: `requests/phase-5-fixes/fix-bug-weak-words-source-coverage.md`

### Medium-2 — `generate-feedback` profile lookup hardcodes the user's first user_languages row

**File:** `supabase/functions/generate-feedback/index.ts:50-66`

```ts
const langs = await serviceClient
  .from('user_languages')
  .select('cefr_level')
  .eq('user_id', userId)
  .limit(1);
const cefr = (langs.data?.[0]?.cefr_level ?? 'A1') as …;
```

For a user studying ES at A1 and FR at B2, all feedback is generated at A1 regardless of which card the attempt was for. The card carries `language_code`; the right query is `.eq('language_code', attempt.card_language_code)`. The handler factory's deps abstract `getProfile(userId)` — the language code isn't passed in, so the bug is in the production wiring rather than the handler signature. Either extend the dep signature to take the card language, or fold the per-language lookup later (after `getAttempt`) inside the handler.

→ Fix request: `requests/phase-5-fixes/fix-bug-feedback-cefr-by-card-language.md`

### Medium-3 — `useFeedback`'s 429 fallback path conflates rate-limit and transport errors

**File:** `apps/web/src/features/feedback/useFeedback.ts:59-71`

Both transport errors and edge-error-body cases collapse to `return null` and a `console.warn`. That meets the "don't surface a red error" criterion — but the user has no signal that they're rate-limited (vs the AI being temporarily down vs no feedback being available at all). The hook should distinguish at minimum between "feedback unavailable" (canned-text fallback) and "rate limited" (no canned-text fallback or a milder "AI feedback unavailable today" badge). Same comment for `generate-lesson` 429 — the page already differentiates correctly via `messageFor(err)`.

The fix here is small: when the edge body's `error.code === 'RATE_LIMITED'`, return the canned-text fallback (same as the free-tier path) rather than `null`. The user gets *some* feedback even when their Pro quota is exhausted.

→ Fix request: `requests/phase-5-fixes/fix-bug-feedback-rate-limited-fallback.md`

## Low

### Low-1 — `flip-tier` self-flip check is correct but undocumented in the schema/contract reference

The migration body forbids `auth.uid() = p_target_id`. The Edge Function maps `SELF_FLIP_FORBIDDEN` to `FORBIDDEN_RESOURCE` (not `FORBIDDEN_TIER`). The api-contracts.md doc doesn't list the `flip-tier` Edge Function at all yet (drift-audit Critical-1) — once it does, document the SELF_FLIP_FORBIDDEN → FORBIDDEN_RESOURCE mapping.

The audit emphasis explicitly noted "ensure an admin can in fact flip non-self users to admin (per the migration body — that's by design for the v1 single-user beta)." Confirmed: `flip_tier` only validates `p_new_tier in ('free', 'pro', 'admin')` and the SELF_FLIP_FORBIDDEN guard. An admin can flip user B to `admin`. By design.

### Low-2 — `lesson-prompt.ts` and `feedback-prompt.ts` carry duplicated `stripFence` helpers

**Files:** `packages/shared/src/feedback-prompt.ts:100-105`, `packages/shared/src/lesson-prompt.ts:92-97`

Two copies; the latter explains "Local copy of the fence stripper… so Deno's strict TS resolution doesn't have to traverse an extra relative path." The two implementations are bit-identical. If they ever diverge, a model that wraps output differently between the two functions could pass one and fail the other. Move to a shared `stripFence` exported once and re-importable.

The shared `index.ts` already re-exports `stripFence` from `feedback-prompt`; it just needs to be the only copy.

→ Optional fix request (not blocking): `requests/phase-5-fixes/fix-bug-strip-fence-dedup.md`
