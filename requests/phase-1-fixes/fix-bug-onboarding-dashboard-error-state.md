# fix-bug: surface query errors in `OnboardingGuard` and `Dashboard`

## What's wrong
Both `OnboardingGuard` (`apps/web/src/features/onboarding/OnboardingGuard.tsx:18–46`) and `Dashboard` (`apps/web/src/features/dashboard/Dashboard.tsx:17–39`) use `useQuery` with no error handling. If the Supabase request fails (network failure, expired JWT, RLS regression), the user sees:
- OnboardingGuard: a blank screen forever (returns `null` when `data` is undefined and `isLoading` is false-but-error).
- Dashboard: "Hi there!" with "0 cards due" — looks like a normal empty state, but the user is actually broken.

## Why it matters
- Silent failure is the worst UX class — the user can't tell whether something's broken or whether they did something wrong.
- An OnboardingGuard error that resolves to "blank screen" is also an accessibility issue: no announced state, no recourse.
- For an authenticated app where every page depends on a Supabase round-trip, "the network failed" is a state we'll see often (PWA offline, flaky mobile networks, Supabase brief outages).

## Proposed fix
Add an `isError` branch to both components.

For `OnboardingGuard`:
```tsx
const { data, isLoading, isError, error, refetch } = useQuery({...});
if (!user) return null;
if (isLoading) return null;
if (isError) {
  return (
    <main role="alert" className="...">
      <p>We couldn't load your profile. {(error as Error).message}</p>
      <button type="button" onClick={() => refetch()}>Retry</button>
    </main>
  );
}
```

For `Dashboard`: same shape, with the error message rendered inside the dashboard chrome (Header + main) so the user can still sign out.

## Files to touch
- `apps/web/src/features/onboarding/OnboardingGuard.tsx`
- `apps/web/src/features/onboarding/OnboardingGuard.test.tsx` (add an error-state test)
- `apps/web/src/features/dashboard/Dashboard.tsx`
- `apps/web/src/features/dashboard/Dashboard.test.tsx` (add an error-state test)

## Acceptance criteria
- [ ] When the profiles query rejects, OnboardingGuard renders an element with `role="alert"` containing the error message and a Retry button.
- [ ] When the profiles query rejects, Dashboard renders the Header (so the user can sign out) plus an alert region.
- [ ] Both new tests pass; both fail when the error branch is removed.
- [ ] `pnpm test` and `pnpm lint` are green.
