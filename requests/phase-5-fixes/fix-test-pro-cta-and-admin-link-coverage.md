# Fix — Dashboard.test.tsx + Header.test.tsx don't cover Pro CTA / admin link conditional rendering

**Severity:** Medium. Test-audit Phase-5 Medium-3.

## Root cause

- `apps/web/src/features/dashboard/Dashboard.tsx:66-79` renders the "Generate a lesson" CTA only when `tier ∈ {pro, admin}`. `Dashboard.test.tsx` mocks `useProfile` to return a free-tier profile (line 22-32) and never tests the Pro branch.
- `apps/web/src/features/dashboard/Header.tsx:36-43` renders the `Admin` link only when `profile.is_admin` is true. `Header.test.tsx` mocks `useProfile` to return `is_admin: false` and never tests the admin branch.

Both conditional blocks have zero test coverage. The Phase-5 audit gate emphasis specifically calls out the Header conditional ("verify no a11y regression").

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | New test in `Dashboard.test.tsx` mocks Pro-tier profile and asserts the "Generate a lesson" CTA + link to `/app/generate` are visible. |
| 2 | Companion test asserts the CTA is NOT visible for free-tier (existing default suite is fine if it doesn't query for the CTA — add an explicit absence assertion). |
| 3 | New test in `Header.test.tsx` mocks `is_admin: true` and asserts the `Admin` link is in the DOM with the correct `href="/app/admin"` and is reachable by accessible name `Admin`. |
| 4 | Companion absence assertion for `is_admin: false` (the existing default). |
| 5 | A11y check: the conditional `Admin` link has no `aria-current` mismatch, no `tabIndex={-1}` regression, and is keyboard-reachable. |

## Files to touch

- `apps/web/src/features/dashboard/Dashboard.test.tsx`
- `apps/web/src/features/dashboard/Header.test.tsx`

## Out of scope

Refactoring `useProfile` mock setup into shared test helpers — defer until a third or fourth Pro/admin-conditional test arrives.
