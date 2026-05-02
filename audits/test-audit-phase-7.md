# Test Audit — Phase 7 (Deployment)

Reviews test coverage for Phase 7's surface.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Warning  | 1     |
| Info     | 1     |

## Findings

### Warning-1 — No automated post-deploy smoke

Phase 7 ships a deploy pipeline but no `scripts/post-deploy-smoke.sh`. The deploy was verified by hand via `curl` against the production URL; future deploys have no automated artifact to run.

This is the same finding surfaced in `audits/bughunt-phase-7.md` Warning-1 — listing here because it is fundamentally a test-coverage gap. Tracked as DEBT-009.

### Info-1 — Phase 7 has no logic-bearing code that warrants unit tests

The phase ships:
- `apps/web/vercel.json` — declarative config, validated by Vercel at deploy time.
- `scripts/deploy-supabase.sh` — run-once-per-deploy bash idempotency wrapper.
- Doc updates (`README.md`, `.claude/manual-testing.md`, `requests/phase-7-deployment/*.md`).
- A package.json dep (`workbox-window`) already exercised by Phase 6's offline tests.

No new TS units → no Vitest specs needed. The "tests-after escape" rule in CLAUDE.md doesn't apply because there is no logic surface to test, not because we deferred. The applicable test layer is the post-deploy smoke (above), which is a gate not a unit.

## Existing test suite at end of phase
- Unit + component (Vitest) — green pre-deploy.
- Integration (Supabase local) — green pre-deploy.
- E2E (Playwright) — green pre-deploy.
- Production smoke — manual `curl` only; automation deferred.

## Blocking
None.
