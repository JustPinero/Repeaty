# fix-test: replace `expect(true).toBe(true)` RLS-enabled assertion in schema.test

## What's wrong
`apps/web/tests/integration/supabase/schema.test.ts:33–44` — the test "every user-owned table has RLS enabled" is `expect(true).toBe(true)`. The skill (`bughunt`/`test-audit`) explicitly calls out this anti-pattern. The inline justification ("anon-denial in rls-isolation.test.ts is the real check") is partially correct, but a no-op test is worse than no test — it shows green and gives false confidence.

## Why it matters
RLS-enabled state is load-bearing: a future migration that adds a table without enabling RLS would leak data. The current `rls-isolation.test.ts` only proves isolation for the seven tables it exercises directly; a new table added in Phase 5 (`feedback_cache`, `rate_limits`) without an isolation test added in lockstep would not be caught by anything.

## Proposed fix
Replace the no-op block with a real probe. Two options:

**Option A (minimal, no migration):** add a small SQL function via migration that returns `pg_class.relrowsecurity` for a given table name; grant EXECUTE to service_role only; call it from the test.

```sql
-- supabase/migrations/0008_rls_check_helper.sql
create or replace function public._test_relrowsecurity(p_table text)
returns boolean language sql security definer set search_path = public
as $$ select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and c.relname=p_table $$;
revoke all on function public._test_relrowsecurity(text) from public;
grant execute on function public._test_relrowsecurity(text) to service_role;
```

Then in the test:
```ts
for (const t of expectedTables) {
  const { data } = await service.rpc('_test_relrowsecurity', { p_table: t });
  expect(data, `expected RLS enabled on ${t}`).toBe(true);
}
```

**Option B (no migration):** use the supabase-js client to query a metadata view that's already exposed (`pg_meta` is not, but service-role can `from('pg_class').select(...)` — verify in local dev whether Supabase exposes pg catalog through the REST layer; if not, fall back to Option A).

**Option C (give up the test):** delete the no-op block entirely. It's better to have one missing assertion than a fake one.

Pick A unless adding a Phase-1 migration after the cutoff is undesired — in that case pick C.

## Files to touch
- `apps/web/tests/integration/supabase/schema.test.ts`
- (Option A only) `supabase/migrations/0008_rls_check_helper.sql`

## Acceptance criteria
- [ ] No `expect(true).toBe(true)` remains in the file.
- [ ] If Option A: removing `enable row level security` from `0001_init_profiles.sql` makes the test fail in CI.
- [ ] If Option C: the deletion is documented in the test file with a one-line comment pointing at `rls-isolation.test.ts`.
