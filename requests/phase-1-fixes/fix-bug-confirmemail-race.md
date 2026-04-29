# fix-bug: fix `ConfirmEmail` race against `detectSessionInUrl`

## What's wrong
`apps/web/src/pages/ConfirmEmail.tsx:12–39` runs `await supabase.auth.getUser()` inside the effect immediately on mount. Supabase's `detectSessionInUrl: true` (set in `apps/web/src/lib/supabase.ts:13`) processes the URL hash asynchronously. There's a window where `getUser()` resolves with `null` before the SDK has finished extracting the access token from the hash, leading to a flash of "No active session found" before (in some flows) the listener catches up.

In practice, today's Supabase JS resolves quickly enough that this rarely flashes — but the contract should be subscription-based, not race-based.

## Why it matters
- "Email confirmed but the page says No active session" is a high-bounce UX moment.
- The fix is small and the result is deterministic.

## Proposed fix
Subscribe to `onAuthStateChange` and resolve when `SIGNED_IN` (or initial `INITIAL_SESSION` with non-null `session`) fires:

```tsx
useEffect(() => {
  let cancelled = false;
  setStatus('verifying');

  // 1) Try the cached session first (synchronous-ish from localStorage).
  supabase.auth.getSession().then(({ data, error }) => {
    if (cancelled) return;
    if (error) { setStatus('error'); setErrorMsg(error.message); return; }
    if (data.session) { setStatus('success'); navigate('/app', { replace: true }); }
  });

  // 2) Subscribe so URL-hash-driven sign-ins also resolve us.
  const { data: { subscription } } = supabase.auth.onAuthStateChange((evt, session) => {
    if (cancelled) return;
    if (session?.user) { setStatus('success'); navigate('/app', { replace: true }); }
  });

  // 3) After a short grace period, if still no session → error.
  const timer = setTimeout(() => {
    if (!cancelled) {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (!data.session) { setStatus('error'); setErrorMsg('No active session found. Try signing in.'); }
      });
    }
  }, 1500);

  return () => { cancelled = true; subscription.unsubscribe(); clearTimeout(timer); };
}, [navigate]);
```

(Tunable: 1500ms is generous; 750ms is probably enough.)

## Files to touch
- `apps/web/src/pages/ConfirmEmail.tsx`
- `apps/web/src/pages/ConfirmEmail.test.tsx` (new — covers verifying / success / timeout-error states with mocked supabase)

## Acceptance criteria
- [ ] No `getUser()` call before the auth state has settled.
- [ ] Three explicit states (verifying / success / error) are deterministic in tests.
- [ ] On a successful URL-hash sign-in, `navigate('/app', { replace: true })` is called.
- [ ] No regressions in the E2E flow.
