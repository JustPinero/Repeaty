# fix-bug: handle `supabase.auth.signOut()` failure in `Header`

## What's wrong
`apps/web/src/features/dashboard/Header.tsx:11–14`:

```ts
async function handleSignOut() {
  await supabase.auth.signOut();
  navigate('/login', { replace: true });
}
```

If `signOut()` rejects (network failure, revocation server-side issue), the navigation still happens. The local session may not be cleared, leaving the React Query auth cache + the supabase-js session in a state where `useAuthUser` still reports the old user. A subsequent direct navigation to `/app` could pass `RequireAuth` without a re-login.

## Why it matters
- Edge case, but the security contract of "Sign out clears the session" should be unconditional.
- Combined with the cache invalidation gap, a confused-deputy in a shared device scenario could matter.

## Proposed fix
Force a local sign-out (which clears localStorage even if the network call fails), and clear the auth-related query cache:

```ts
async function handleSignOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('signOut server-side failed; clearing local session', error);
    await supabase.auth.signOut({ scope: 'local' });
  }
  qc.removeQueries({ queryKey: ['auth-user'] });
  qc.removeQueries({ queryKey: ['onboarding-status'] });
  navigate('/login', { replace: true });
}
```

Where `qc` is `useQueryClient()`.

## Files to touch
- `apps/web/src/features/dashboard/Header.tsx`
- `apps/web/src/features/dashboard/Header.test.tsx` (add a test where `signOut()` rejects)

## Acceptance criteria
- [ ] When `signOut()` rejects, `signOut({ scope: 'local' })` is invoked.
- [ ] Auth-related query cache is removed before navigation.
- [ ] User lands on `/login` regardless of network outcome.
- [ ] New test fails when the local-fallback or cache-clear is removed.
