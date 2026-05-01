# Fix — AdminPage cannot list other users' profiles under RLS

**Severity:** High. Bughunt Phase-5 High-1.

## Root cause

The `profiles` SELECT RLS policy (`supabase/migrations/0006_rls_policies.sql:14-17`) is `auth.uid() = id`. `apps/web/src/features/admin/AdminPage.tsx:30-39` queries `from('profiles').select(…).order(…).limit(50)` through the user-context Supabase client. Even when the caller is admin, the RLS policy filters out every row except their own. The page renders one card (the admin themselves), the cycle button is disabled by the self-flip guard, and nothing useful happens.

`AdminPage.test.tsx` mocks the chain to return multiple rows side-stepping RLS, so unit tests pass. The bug surfaces only against a live database.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | An admin user's `/admin` page lists every profile in the system (or paged equivalent), not just their own. |
| 2 | A non-admin user hitting `/admin` directly is still redirected by `AdminGuard` (no regression). |
| 3 | A live-Supabase integration test seeds two non-admin profiles + one admin profile, signs in as admin, asserts the admin sees ≥ 3 rows and a non-admin sees their own row only. |
| 4 | The chosen mechanism is documented in `references/schema.md` (RLS update, RPC, or Edge Function — see § Suggested options). |

## Suggested options

1. **Extend the profiles SELECT policy** — add an `OR` arm:
   ```sql
   create policy profiles_select_own_or_admin on public.profiles
     for select to authenticated
     using (
       auth.uid() = id
       OR exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
     );
   ```
   Pro: simplest. Con: every authenticated read against `profiles` re-evaluates the OR — measurable for the dashboard if the user base grows. Mitigate with an index on `profiles(is_admin) where is_admin = true` (tiny set).

2. **A SECURITY DEFINER RPC `list_admin_profiles(p_limit int)`** — explicit, callable only when caller is admin, returns the rollup. Pro: keeps the table policy tight. Con: another RPC to maintain.

3. **An Edge Function `list-admin-profiles`** — service-role read with admin-check. Pro: matches the `flip-tier` pattern. Con: adds a network round-trip for what's logically a join.

Recommend option 2 — keeps the table policy tight, is explicitly auditable, and matches the existing `complete_onboarding` RPC pattern.

## Files to touch

- `supabase/migrations/0018_list_admin_profiles_rpc.sql` (NEW — if option 2)
- `apps/web/src/features/admin/AdminPage.tsx` — swap the `from('profiles')` query for `supabase.rpc('list_admin_profiles', { p_limit: 50 })`.
- `apps/web/src/features/admin/AdminPage.test.tsx` — update the mock chain.
- `apps/web/tests/integration/supabase/list-admin-profiles-rpc.test.ts` (NEW).
- `references/schema.md` § RPCs — add the new RPC.

## Out of scope

Pagination of `/admin` beyond `limit(50)` — Phase 6 polish.
