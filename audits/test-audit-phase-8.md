# Test Audit — Phase 8 (Continuous Deployment & Observability)

Reviews test coverage for Phase 8.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Warning  | 0     |
| Info     | 3     |

## Findings

### Info-1 — Workflow YAML has regression coverage (RED-first)

- `scripts/test-ci-config.test.ts` (5 tests) — asserts shape of `production-smoke` job in `.github/workflows/ci.yml`.
- `scripts/test-deploy-config.test.ts` (6 tests) — asserts trigger, ordering, and rollback step in `.github/workflows/deploy.yml`.

Both went RED before their respective workflow edits and turned GREEN once those edits landed. A future contributor breaking the deploy ordering or removing the rollback step trips the suite locally before they push.

### Info-2 — `client_error_log` covered at three layers

- **Integration / RLS** (`apps/web/tests/integration/supabase/client-error-log-rls.test.ts` — 6 tests): table exists, RLS enabled, insert-own works, cross-user insert is rejected, no SELECT policy, default `user_id = auth.uid()` works.
- **Unit / helper** (`apps/web/src/lib/error-log.test.ts`): `scrubPayload` strips secret fields by name and `sk-` patterns inside strings, caps stack/extra at 8/4 KB, `logClientError` writes to supabase, never throws on rejection, rate-limits at 5/60s with cooldown.
- **Component** (`apps/web/src/components/ErrorBoundary.test.tsx`): renders children when no error; renders fallback + logs once when a child throws.
- **Hook** (`apps/web/src/lib/useGlobalErrorListeners.test.ts`): logs `error` events, logs `unhandledrejection`, removes listeners on unmount.

### Info-3 — No production-targeted E2E

The same out-of-scope decision from Phase-7 holds: real production E2E remains a Phase-9 candidate. The post-deploy smoke (`pnpm smoke`) is the v1 substitute and is wired into both CI (`production-smoke` job) and the auto-deploy pipeline (final step before rollback decision).

## Existing test suite at end of phase
- Unit + component (Vitest, apps/web): 275 → 281 (net +6 from Phase 8: 5 ErrorBoundary + scrubPayload + rate-limit + useGlobalErrorListeners; some merge into existing files).
- Scripts (Vitest, root): 16 → 27 (net +11 from Phase 8: 5 ci.yml + 6 deploy.yml).
- Integration (Supabase local): 86 → 92 (net +6 from Phase 8).
- E2E (Playwright): unchanged.
- Production smoke: extended from 12 to 12 assertions; runs in CI on every push to main.

## Blocking
None.
