# Fix — Dashboard fetches `profiles` twice on every mount

**Severity:** Medium. Optimize Phase-5 Medium-1.

## Root cause

`apps/web/src/features/dashboard/Dashboard.tsx:17-37` calls `useProfile()` (line 17), which fires a `from('profiles').select('id, display_name, email, native_language_code, tier, is_admin').eq('id', userId).maybeSingle()` against the user's profile row. The `useQuery(['dashboard', userId])` body (lines 24-27) issues a *second* `from('profiles').select('display_name')` against the same row. Net: two round trips for data that's a strict subset of one.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | The dashboard mount fires exactly one `profiles` SELECT for the current user. |
| 2 | The dashboard's display name is sourced from `useProfile().profile.display_name` (single source of truth). |
| 3 | The dashboard query reduces to just the `user_languages` lookup. |
| 4 | `Dashboard.test.tsx` is updated to reflect the reduced fromMock surface (only `user_languages` calls expected). |
| 5 | No regression in the dashboard's error / retry / language-selector / Peaty-greeting branches. |

## Files to touch

- `apps/web/src/features/dashboard/Dashboard.tsx`
- `apps/web/src/features/dashboard/Dashboard.test.tsx`

## Out of scope

Folding `user_languages` into a single combined dashboard RPC — Phase 6 polish if the dashboard queries multiply.
