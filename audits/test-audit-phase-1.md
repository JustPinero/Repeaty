# TestAudit — Phase 1 (foundation)

Mode: quick. Scope: files modified between `main` and `phase-1-foundation` HEAD.

## Overall grade: **B**

Most happy + sad paths are covered. The integration suite is strong (RLS isolation, RPC validation, triggers). The "tests-after escape" applied to a few presentational pieces is documented and acceptable — but the orchestrator (`OnboardingWizard`) has nontrivial logic (mutateAsync → reset → navigate) that should not have used the escape, and the client-side RPC hook (`useCompleteOnboarding`) has no unit test even though Request 1.4 explicitly listed one. There's also one anti-pattern in `schema.test.ts` (`expect(true).toBe(true)` for the RLS-enabled assertion) and a few component error paths are unverified.

## Per-area grades

| Area                                  | Grade | Notes                                                                                                  |
| ------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| Env / app shell                       | A     | `env.test.ts` covers all branches; `App.test.tsx` mounts router under provider                          |
| Auth feature (forms, hook, guard)     | B     | All four unit specs cover happy + sad paths. Missing: navigation assertion on successful login         |
| Auth pages (Signup/Login/ConfirmEmail)| C     | Tests-after escape applied. ConfirmEmail has nontrivial useEffect/race logic that is not unit-tested  |
| Routes (`routes/index.tsx`)           | C     | Tests-after escape — no unit test verifies the `<RequireAuth>` + `<OnboardingGuard>` wrap at `/app/*` (E2E exercises it) |
| Onboarding steps (Step1/2/3)          | A     | Excellent — validation, hydration, button-disabled, trim, callbacks, all asserted                       |
| Onboarding orchestrator (Wizard)      | D     | Tests-after escape applied to a component that owns mutateAsync + reset + navigate. Real orchestration logic untested |
| Onboarding guard                      | B     | Both branches (display_name null, no targets) covered. Error path on the RPC query is NOT tested        |
| Onboarding RPC client hook            | F     | `useCompleteOnboarding.ts` has zero tests. Request 1.4's matrix listed a vitest test for it             |
| Dashboard (Dashboard, Header, etc.)   | B     | Per-component tests are good; Dashboard query-error path not tested; sign-out failure path not tested  |
| Integration (RLS isolation)           | A     | Covers cross-user reads, tier escalation, soft-deletes, denormalized cards. Strong                      |
| Integration (RPC `complete_onboarding`)| A    | Empty-name, empty-targets, bad CEFR, success, idempotent re-run. Comprehensive                          |
| Integration (triggers)                | A     | Profile-on-signup + email-change mirror covered                                                         |
| Integration (schema.test)             | C     | Two of the three blocks are weak: the `it.each(...) reachable` test is correct; the "every user-owned table has RLS enabled" test is `expect(true).toBe(true)` (anti-pattern); the constraint test is good |
| E2E (signup-and-onboarding)           | B     | Drives the full happy path. Missing: axe scan promised in Request 1.5; back-button continuity promised in 1.4 |

## Specific findings

1. `apps/web/tests/integration/supabase/schema.test.ts:33–44` — the "every user-owned table has RLS enabled" `it()` block contains `expect(true).toBe(true)` and a comment explaining the assertion was deferred. This is the textbook anti-pattern the skill calls out. The justification (anon-denial in `rls-isolation.test.ts` is the real check) is reasonable, but the test should be deleted or replaced with a real `pg_class.relrowsecurity` query via a service-role RPC.
2. `apps/web/src/features/onboarding/useCompleteOnboarding.ts` — zero unit tests. Request 1.4 explicitly lists this as a RED-phase test. The integration suite tests the RPC, not the hook (mutation success path → onSuccess invalidates the right query key, mutation error path → error returned).
3. `apps/web/src/features/onboarding/OnboardingWizard.tsx` — tests-after escape applied. The orchestrator owns: setStep transitions, mutateAsync → reset → navigate, and error-display logic. None of this is unit-tested. The E2E hits the happy path but not error flows.
4. `apps/web/src/pages/ConfirmEmail.tsx:12–39` — `useEffect` with cancelled-flag race + getUser() result handling. Tests-after escape applied. Worth a small spec: the three states (verifying / success / error) and the cleanup-on-unmount.
5. `apps/web/src/features/auth/LoginForm.test.tsx` — no assertion that successful login navigates to `/app`. SignupForm test similarly only asserts `signUp` was called.
6. `apps/web/src/features/onboarding/OnboardingGuard.test.tsx` — query-error path (Supabase down, profile read fails) is not tested. The current implementation simply renders `null`, which leaves the user on a blank screen. Surface either an error UX or a test asserting the absence of one (so the gap is visible).
7. `apps/web/src/features/dashboard/Dashboard.test.tsx` — `data` undefined / loading / error states untested. Dashboard renders fine in those states but a test should pin the contract.
8. `apps/web/src/features/dashboard/Header.test.tsx` — no test for `signOut` returning an error. Currently the user is navigated to `/login` regardless; that's a defensible choice but not pinned by a test.

## Top three improvements (ranked by impact)

1. **Add a unit test for `useCompleteOnboarding`** (Request 1.4 promised one and it slipped). High coverage gap on a hook that touches the database.
2. **Replace the no-op `expect(true).toBe(true)` block in `schema.test.ts`** with either a real RLS-enabled probe or delete it (don't ship a test that can't fail).
3. **Test the `OnboardingWizard` orchestrator** — at minimum: step transitions, mutateAsync called with the right payload, navigate called on success, error rendered on failure.

## Blocking findings

None. No D/F finding sits on a critical-path security control. The two D/F areas (Wizard orchestrator, useCompleteOnboarding hook) are both functionally exercised end-to-end by the E2E spec and integration suite. The phase is mergeable per the skill's blocking rule.

## Fix-request files generated

- `requests/phase-1-fixes/fix-test-onboarding-rpc-hook.md`
- `requests/phase-1-fixes/fix-test-wizard-orchestrator.md`
- `requests/phase-1-fixes/fix-test-schema-rls-noop.md`
