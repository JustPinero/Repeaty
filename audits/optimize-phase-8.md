# Optimize — Phase 8 (Continuous Deployment & Observability)

Performance / cost / runtime audit of the Phase-8 surface.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Warning  | 0     |
| Info     | 4     |

## Findings

### Info-1 — Bundle impact: ~2 KB gz for ErrorBoundary + helpers

ErrorBoundary, `error-log.ts`, `useGlobalErrorListeners.ts`, and `GlobalErrorListenerMount.tsx` together compile to ~2 KB gzipped — well within the 500 KB main-chunk budget enforced by `pnpm build:size`. No code-split needed; these run at boot anyway.

### Info-2 — `client_error_log` index: `(user_id, created_at desc)` is the right shape

The dominant query — "show me a user's recent errors" — runs against the leftmost prefix and uses the desc ordering. A compound index here is both the read path and the partition for any future per-user retention. No further tuning needed for v1 traffic levels.

### Info-3 — `production-smoke` runs in ~3s, well under the 5-min job timeout

`scripts/post-deploy-smoke.sh` makes ~12 sequential HTTP requests and exits in 2–4 seconds locally. The 5-minute job timeout in ci.yml is generous slack against cold-start jitter or temporary DNS flakes. Could tighten to 60s if we wanted faster feedback on a hung run.

### Info-4 — `deploy.yml` is sequential by design

Migrations → edge functions → frontend → smoke run sequentially in a single job. Parallelizing would require splitting into multiple jobs (one per surface), passing artifacts between them, and re-doing setup. Total wall-clock ~3 minutes, which is acceptable for a single-user beta.

## Cost

- **GitHub Actions:** the new jobs run on `ubuntu-latest` for ~30 seconds (production-smoke) and ~3 minutes (deploy). Hobby tier includes 2000 minutes/mo; we'll burn ~10 mins per push. Negligible.
- **Supabase:** `client_error_log` writes are tiny (rows < 16 KB after the stack/extra caps); inserts cost ~one row per error, capped at 5/60s per user. At one user (Ben) this is sub-cent monthly.
- **Vercel deployments:** unchanged from the manual path — same prebuilt deploy contract as 7.1.

## Blocking
None.
