# Bughunt — Phase 8 (Continuous Deployment & Observability)

Adversarial review of the Phase-8 surface: GitHub Actions deploy pipeline, post-deploy smoke gate, and the new `client_error_log` write path.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Warning  | 2     |
| Info     | 3     |

## Findings

### Warning-1 — `production-smoke` in ci.yml runs against the *previous* deploy, not the new one

`.github/workflows/ci.yml` (lines for `production-smoke`) runs on push to `main`, in parallel with `validate`/`edge-functions`/etc. CI's success then triggers `deploy.yml`. So:

1. Push to `main` → CI fires → `production-smoke` runs against the deploy that's currently live (the *previous* deploy), confirming it's healthy.
2. CI succeeds → `deploy.yml` fires → builds + deploys → its own `Smoke against new deploy` step runs against the *new* deploy.

This is a feature, not a bug — both checks are useful — but the ci.yml job's name implies it gates the new deploy, which it doesn't. Confusion will bite when a fresh deploy goes bad and a green ci.yml run lulls the operator.

→ Cosmetic fix: rename the ci.yml job to `live-smoke` (or `pre-deploy-live-smoke`) to make the timing clear. Or move it out of ci.yml entirely into a scheduled cron-like workflow that runs every 30 minutes.

→ Track in `audits/debt.md` as DEBT-010 ("Rename production-smoke to live-smoke for clarity").

### Warning-2 — `deploy.yml` has no fallback when `vercel rollback` itself fails

The rollback step's only failure mode is "the previous deployment can't be promoted" (Vercel auth expired, network blip). When this happens, the step exits non-zero, the workflow exits non-zero, and we end up with a broken production AND a missed rollback. There's no human-paging alert — only the GitHub Actions failure email lands.

For one user (Ben + Justin), the GitHub Actions failure email is acceptable in v1. But document that if the workflow fails mid-rollback, the manual recovery is `vercel rollback` from a local terminal, or `vercel redeploy <previous-id> --prod`.

→ Track in `audits/debt.md` as DEBT-011 ("Manual rollback runbook in references/deployment-landmines.md").

### Info-1 — `API_KEY_PATTERN` regex covers OpenAI + Anthropic but not Stripe / GitHub / AWS

`apps/web/src/lib/error-log.ts:13`: `/sk-(?:ant-)?[A-Za-z0-9_-]{8,}/g` catches `sk-...` and `sk-ant-...`. Stripe's `sk_live_...`, GitHub's `ghp_...`, AWS's `AKIA...` would slip through. v1 doesn't use any of those keys client-side, so the gap is theoretical — but if Phase-9 ever ships Stripe (DEBT-001), revisit this scrubber.

### Info-2 — `__APP_VERSION__` falls back to `'dev'` when git is unavailable

`apps/web/vite.config.ts:gitShortSha` tries `git rev-parse --short HEAD` and falls back to `'dev'`. Vercel build runners do have git, so production deploys carry the SHA. Local builds without a git checkout (rare) carry `dev`. Caller can override via `VITE_APP_VERSION` env var if a different version string is desired.

### Info-3 — Self-amplifying error loop is bounded but not eliminated

`apps/web/src/lib/error-log.ts:checkRateLimit` caps logging at 5 per 60s. After cap, errors are silently dropped — including the very error that filled the bucket. A truly broken render path that errors continuously would log 5 in the first second, then go silent for 59. This is the right tradeoff (don't spam the user's row count infinitely), but the cap means we can lose the first-cause stack if it arrives mid-burst. Acceptable.

## Not findings (looked, no issue)

- **`auth.uid()` column default + WITH CHECK race.** Postgres evaluates column defaults *before* WITH CHECK, so a row with no explicit `user_id` correctly populates with `auth.uid()` and then satisfies the policy. Verified in integration tests.
- **Rate-limited insert leaking secrets.** The scrubber runs *before* the rate-limit check (`logClientError` → `scrubPayload` → `checkRateLimit` → insert). Even when an insert is dropped due to rate-limit, no secrets reach memory in cleartext for longer than the function's lifetime.
- **Workflow secrets in logs.** All `${{ secrets.X }}` references in `.github/workflows/deploy.yml` are passed via `env:` and `--token=`. GitHub Actions automatically masks secret values in logs. Verified by spot-check of the workflow.

## Blocking
None.
