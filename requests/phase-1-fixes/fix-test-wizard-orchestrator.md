# fix-test: cover `OnboardingWizard` orchestration logic

## What's wrong
`apps/web/src/features/onboarding/OnboardingWizard.tsx` was committed under the "tests-after escape" but it owns three pieces of nontrivial logic that don't qualify as purely presentational:
1. `handleSubmit` — calls `setTargets`, then `mutateAsync`, then `reset`, then `navigate('/app', { replace: true })`. Order matters.
2. Step routing based on `step === 1|2|3` from the persisted store.
3. Error rendering when `useCompleteOnboarding` returns an error.

The E2E covers the happy path. Failure paths and step-transition logic have zero unit coverage.

## Why it matters
- A regression where `reset()` is called before `mutateAsync` settles would clear the store while the request is in-flight; back-button continuity (a Request-1.4 acceptance criterion) silently breaks.
- A regression where `navigate` runs before invalidation completes can leave the user on a "needsOnboarding=true" Dashboard rendering the wizard again.
- The error region only renders when `error` is non-null; a regression that swallows the error breaks the surface.

## Proposed test
Create `apps/web/src/features/onboarding/OnboardingWizard.test.tsx`:
- Mock `./useCompleteOnboarding` to return a controllable `{ mutateAsync, isPending, error }`.
- Mock `./useOnboardingState` (or use the real Zustand store and reset between tests via `setState(initialState)`).
- Mock `react-router-dom`'s `useNavigate` to capture the call.
- Tests:
  1. With `step === 1`, only `Step1Name` renders.
  2. After completing all three steps, `mutateAsync` is called with `{ displayName, nativeLanguageCode, targets: [{ language_code, cefr_level }] }` derived from the store.
  3. On `mutateAsync` resolution, `navigate('/app', { replace: true })` is called and the store is reset (assert via `useOnboardingState.getState().displayName === ''`).
  4. When `error` is non-null, an element with `role="alert"` containing the error message renders.

## Files to touch
- `apps/web/src/features/onboarding/OnboardingWizard.test.tsx` (new)

## Acceptance criteria
- [ ] Four passing tests covering the four behaviors above.
- [ ] Tests fail when `reset()` is moved before `await mutateAsync(...)`.
- [ ] Tests fail when `navigate('/app', { replace: true })` is removed from the success path.
- [ ] `pnpm test` passes locally and in CI.
