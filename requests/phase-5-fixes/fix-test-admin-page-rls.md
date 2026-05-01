# Fix — AdminPage tests don't exercise the cross-user list-load path

**Severity:** Medium. Test-audit Phase-5 Medium-1.

## Root cause

`AdminPage.test.tsx` mocks `from('profiles').select().order().limit()` directly, returning a hand-rolled list of multiple rows. The mock side-steps the `profiles` SELECT RLS policy (which is `auth.uid() = id`), so the test is green even though production RLS hides every row from the admin except their own (bughunt High-1).

A test that hits live Supabase as an admin user and asserts the row count would have caught the bug.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | An integration test at `apps/web/tests/integration/supabase/admin-profiles-list.test.ts` seeds at least three users (one admin, two non-admins). |
| 2 | The admin user's client (or RPC, depending on the chosen fix from `fix-bug-admin-page-rls-list.md`) is asserted to return all three rows. |
| 3 | A non-admin user's client returns only their own row. |
| 4 | (When `fix-bug-admin-page-rls-list.md` lands) the test asserts the new RPC's grant + return shape. |

## Files to touch

- `apps/web/tests/integration/supabase/admin-profiles-list.test.ts` (NEW)
- (after `fix-bug-admin-page-rls-list.md` lands) `apps/web/src/features/admin/AdminPage.test.tsx` — update the mock to match the new query path.

## Out of scope

Refactoring the existing `AdminPage.test.tsx` into a more behavior-driven shape — keep it as the unit-level smoke and let the integration test carry the RLS contract.
