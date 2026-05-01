# Test Audit — Phase 5

Coverage of every acceptance criterion in `requests/phase-5-ai-personalization/5.{1..6}-*.md` against tests on the `phase-5-ai-personalization` branch.

## Summary

| Severity   | Count |
| ---------- | ----- |
| Critical   | 0     |
| High       | 2     |
| Medium     | 3     |
| Low        | 1     |

Local validate is green, but green-on-existing-tests does not equal coverage. The acceptance criteria for the Phase-5 SQL infra (5.1, 5.2, 5.5) are well-covered by integration suites. The two gaps that matter are (a) the Phase-5.6 E2E flow, which the request explicitly requires at `complete`, and (b) the `generate-feedback` / `generate-lesson` integration tests called out in the request files.

## 5.1 — Pro tier infra

| Criterion                                                          | Test                                                | Status |
| ------------------------------------------------------------------ | --------------------------------------------------- | ------ |
| `rate_limits` PK + RLS read-own / DENY writes                      | `rate-limits-rls.test.ts`                           | ✓      |
| `feedback_cache` UNIQUE + read-public / DENY writes                | `feedback-cache-rls.test.ts`                        | ✓      |
| `tier_change_log` admin-read / DENY non-admin / DENY writes        | `tier-change-log-rls.test.ts`                       | ✓      |
| `bump_rate_limit` returns count, raises P0001 RATE_LIMITED on cap  | `bump-rate-limit-rpc.test.ts`                       | ✓      |
| Per-user isolation (different users count independently)            | same                                                | ✓      |

## 5.2 — Admin tier flip

| Criterion                                                          | Test                                                | Status |
| ------------------------------------------------------------------ | --------------------------------------------------- | ------ |
| `/admin` 403/redirect for non-admins                               | `AdminGuard.test.tsx`                               | ✓      |
| AdminPage lists profiles + tier badge + cycle button               | `AdminPage.test.tsx`                                | ✓ (partial — see Med-1) |
| Tier-flip invokes `flip-tier` with target_user_id + new_tier       | `AdminPage.test.tsx`                                | ✓      |
| `flip-tier` rejects 401/403 for non-admin callers                  | `flip-tier/handler.test.ts`                         | ✓ (handler) + integration | 
| `flip_tier` updates profile + inserts log atomically               | `flip-tier-rpc.test.ts` (live-Supabase)             | ✓      |
| `flip_tier` rejects new_tier ∉ {free,pro,admin}                    | same                                                | ✓      |
| `flip_tier` rejects self-flip                                      | same                                                | ✓      |

## 5.3 — `generate-feedback` Edge Function

| Criterion                                                          | Test                                                | Status |
| ------------------------------------------------------------------ | --------------------------------------------------- | ------ |
| 401 missing/invalid JWT                                            | `generate-feedback/handler.test.ts`                 | ✓      |
| 403 FORBIDDEN_TIER for free tier                                   | same                                                | ✓      |
| 400 INVALID_PAYLOAD malformed body                                 | same                                                | ✓      |
| 404 attempt not found                                              | same                                                | ✓      |
| 400 perfect bucket                                                 | same                                                | ✓      |
| Cache hit returns cached, doesn't call Claude, cached: true        | same                                                | ✓      |
| 504 UPSTREAM_TIMEOUT on AbortError                                 | same                                                | ✓      |
| 502 UPSTREAM_FAILED on parse failure                               | same                                                | ✓      |
| Markdown-fence stripping                                           | same                                                | ✓      |
| 429 RATE_LIMITED on bump raise                                     | same                                                | ✓      |
| Persists feedback_cache + updates source attempt's feedback_text   | (integration test missing — see High-1)             | **MISSING** |
| Structured log includes cost_estimate_usd                          | same                                                | ✓      |

## 5.4 — `useFeedback` Claude swap

| Criterion                                                          | Test                                                | Status |
| ------------------------------------------------------------------ | --------------------------------------------------- | ------ |
| Public types preserved                                              | `useFeedback.test.ts`                               | ✓      |
| Free-tier short-circuits to canned text, no fetch                   | same                                                | ✓      |
| Pro + perfect: no fetch                                             | same                                                | ✓      |
| Pro + miss + attemptId: invokes generate-feedback                   | same                                                | ✓      |
| 429/timeout: returns null text, no UI red                           | same                                                | ✓ (rate-limit case mocks 200-with-body — see Low-1) |
| Cache per (kind, attemptId): re-render no-fetch                     | same                                                | ✓      |

## 5.5 — `generate-lesson` Edge Function

| Criterion                                                          | Test                                                | Status |
| ------------------------------------------------------------------ | --------------------------------------------------- | ------ |
| 401 / 403 / 400 / 400 unknown lang                                  | `generate-lesson/handler.test.ts`                   | ✓      |
| topic_hint capped at 200 chars                                      | same                                                | ✓      |
| card_count clamped [5,25] default 12                                | same                                                | ✓      |
| 429 RATE_LIMITED                                                    | same                                                | ✓      |
| 15s AbortController + UPSTREAM_TIMEOUT                              | same                                                | ✓      |
| Markdown-fence stripping                                            | same                                                | ✓      |
| Zod-validates Claude output                                         | same (Zod-invalid → 502)                            | ✓      |
| Inserts deck + cards atomically (single transaction)                | (integration test missing — see High-1)             | **MISSING** |
| Bumps `lesson_generation` bucket                                    | (handler test mocks bump; live behavior unverified) | partial |
| cost_estimate_usd in log                                            | same                                                | ✓      |
| Prompt-injection: topic_hint inside `<user_content>`                | (manual; doc snippet in handler.ts) — see Med-2     | partial |

## 5.6 — Generate-Lesson UI

| Criterion                                                          | Test                                                | Status |
| ------------------------------------------------------------------ | --------------------------------------------------- | ------ |
| Dashboard CTA only for tier ∈ {pro, admin}                         | (Dashboard.test.tsx mocks free only — see Med-3)    | **MISSING** |
| Free-tier explainer (no upgrade flow)                               | `GenerateLessonPage.test.tsx`                       | ✓      |
| Form: language select, topic_hint 200-cap, card_count 5–25 slider   | same                                                | ✓      |
| Submit → invoke('generate-lesson', body)                            | same                                                | ✓      |
| Spinner + Peaty-Magic during in-flight                              | (no peaty-magic test; pending text verified)        | partial |
| Navigates to `/app/decks/:deck_id/review` on success                | same                                                | ✓      |
| 429 RATE_LIMITED → "today's lessons" message                        | same                                                | ✓      |
| 504 UPSTREAM_TIMEOUT → actionable retry message                     | same                                                | ✓      |
| `generate-lesson-flow` E2E spec at `complete`                       | spec file does not exist — see High-2               | **MISSING** |

## Findings

### High-1 — Missing live-Supabase integration tests for `generate-feedback` and `generate-lesson`
Both 5.3 and 5.5 request files explicitly list `apps/web/tests/integration/supabase/generate-feedback.test.ts` and `…/generate-lesson.test.ts` under their files-to-touch sections. Neither file exists. The handler-factory unit tests cover most behavior, but several criteria require a live database to verify:
- "Persists feedback_cache row + updates source attempt's `feedback_text`" (5.3)
- "Inserts deck row + cards atomically (single transaction)" (5.5)
- The actual `bump_rate_limit` round-trip in the production wiring (which has the auth.uid() bug — see bughunt Critical-1).

Without a live integration test, the rate-limit production bug stayed green through CI.

→ Fix request: `requests/phase-5-fixes/fix-test-edge-fn-integration-suites.md`

### High-2 — `ai-deck-generation-pro` E2E spec absent; manifest still `not-started`
Request 5.6 acceptance criterion: "`generate-lesson-flow` E2E spec at `complete` (CI flag)". The spec file `apps/web/tests/e2e/ai-deck-generation-pro.spec.ts` does not exist and `e2e-manifest.json.flows.ai-deck-generation-pro.status` is still `not-started`. This is an unmet acceptance criterion of the phase.

→ Fix request: `requests/phase-5-fixes/fix-test-ai-deck-generation-e2e.md`

### Medium-1 — AdminPage tests don't exercise the cross-user list-load path
`AdminPage.test.tsx` mocks `from('profiles').select().order().limit()` to return both an admin row and a non-admin row. In production the `profiles` SELECT RLS policy is `auth.uid() = id`, so the admin's user-context client will only ever see their own row. The test mock side-steps the policy and doesn't catch the bug. See bughunt High-2 for the underlying issue; the test gap is that an integration-level test loading `profiles` from an admin would have caught it.

→ Fix request: `requests/phase-5-fixes/fix-test-admin-page-rls.md`

### Medium-2 — No assertion that `topic_hint` and `weakWords` are actually inside `<user_content>` blocks
Request 5.5 acceptance: "Prompt-injection: `topic_hint` is wrapped in `<user_content>` per security-landmines.md — manual; doc snippet in handler.ts". Manual is not a test; this is a security-relevant invariant of `lesson-prompt.ts` that should be unit-tested. `packages/shared/src/lesson-prompt.test.ts` does not exist (or wasn't shipped this phase).

→ Fix request: `requests/phase-5-fixes/fix-test-prompt-injection-isolation.md`

### Medium-3 — Dashboard tests don't exercise the Pro CTA branch
`Dashboard.test.tsx` only mocks the free-tier profile. The Pro CTA conditional (`{isPro && (…)}`) is rendered lines 66–79 of `Dashboard.tsx` and never exercised. Header.test.tsx mocks free-tier profile too; the conditional `Admin` link rendering is also never asserted.

→ Fix request: `requests/phase-5-fixes/fix-test-pro-cta-and-admin-link-coverage.md`

### Low-1 — `useFeedback.test.ts` 429 mock shape diverges from production
The 429 case mocks `{ data: { data: null, error: { code: 'RATE_LIMITED', … } }, error: null }`. supabase-js's `functions.invoke` for a non-2xx response sets the outer `error` to a `FunctionsError`, not the inner data shape. The transport-error case (line 115) covers the actual code path; the 429-specific test is documentary only. Worth adding a `FunctionsHttpError` — shaped mock for fidelity.
