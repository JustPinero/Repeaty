# fix-test: add unit test for `useCompleteOnboarding`

## What's wrong
`apps/web/src/features/onboarding/useCompleteOnboarding.ts` has no unit test. Request 1.4's RED-phase test matrix lists `useCompleteOnboarding.test.ts` as required. The integration suite verifies the RPC contract, not the hook's wiring (mutationFn shape, onSuccess invalidation key, error-mapping).

## Why it matters
This hook is the only client-side path that writes profile + user_languages data. A regression in (a) the RPC parameter names (`p_display_name`, etc.), (b) the `['onboarding-status']` invalidation key, or (c) the error-rethrow contract would silently break onboarding for every new user. The integration test would still pass because it calls the RPC directly.

## Proposed test
Create `apps/web/src/features/onboarding/useCompleteOnboarding.test.ts`:
- Mock `@/lib/supabase` so `supabase.rpc(...)` is a vi.fn returning `{ error: null }` / `{ error: { message: 'boom' } }`.
- Render the hook through a `QueryClientProvider` test wrapper (same shape as `Dashboard.test.tsx`).
- Assert: calling `mutateAsync({ displayName, nativeLanguageCode, targets })` invokes `supabase.rpc('complete_onboarding', { p_display_name, p_native_language_code, p_targets })` exactly once with the correct mapped names.
- Assert: on success, `queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })` was called.
- Assert: on Supabase error, `mutateAsync` rejects with an Error whose `message` matches the supabase error message.

## Files to touch
- `apps/web/src/features/onboarding/useCompleteOnboarding.test.ts` (new)

## Acceptance criteria
- [ ] Three unit tests covering: param mapping, invalidation key, error rethrow.
- [ ] Each test fails if the corresponding line in `useCompleteOnboarding.ts` is changed (e.g. flip `p_native_language_code` → `p_native_lang`; the param-mapping test must catch it).
- [ ] `pnpm test` passes locally and in CI.
