# fix-bug: map onboarding RPC errors to user-friendly messages

## What's wrong
`apps/web/src/features/onboarding/useCompleteOnboarding.ts:24–27` rethrows the supabase error message verbatim. The `complete_onboarding` RPC raises with codes `42501` (not authenticated) and `22023` (validation). The user sees raw Postgres-tinted strings in the wizard's `role="alert"` region. Particularly: `42501` surfaces as "not authenticated" — opaque to a non-technical user.

## Why it matters
- Users blame the app, not their session, for a failed submit.
- The wizard's own validation already prevents the `22023` cases on the happy path, so the only `22023` triggers are race conditions or programming errors. The `42501` case (session expired during the wizard) is the realistic user-facing one.

## Proposed fix
Map known error codes/messages in the mutation's `mutationFn`:

```ts
mutationFn: async (input) => {
  const { error } = await supabase.rpc('complete_onboarding', { ... });
  if (!error) return;
  // supabase-js exposes error.code on PostgrestError-style results.
  if (error.code === '42501' || /not authenticated/i.test(error.message)) {
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (error.code === '22023') {
    throw new Error('We couldn\'t save your onboarding details — please double-check and try again.');
  }
  throw new Error(error.message); // network / other
},
```

If a `42501` is hit, we should also push the user to `/login` after they dismiss the error (consider a follow-up navigate in `OnboardingWizard` when the error matches "session has expired").

## Files to touch
- `apps/web/src/features/onboarding/useCompleteOnboarding.ts`
- `apps/web/src/features/onboarding/useCompleteOnboarding.test.ts` (add cases for each code)
- (Optional) `apps/web/src/features/onboarding/OnboardingWizard.tsx` — when error matches expired-session, navigate to `/login` after a short delay.

## Acceptance criteria
- [ ] Submitting while signed-out (mock `42501`) shows "Your session has expired…" instead of "not authenticated".
- [ ] A `22023` error shows the friendly message instead of the raw RPC string.
- [ ] Network error surfaces the supabase message (no map → falls through).
- [ ] Tests cover each branch.
