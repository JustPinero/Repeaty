# Drift Audit — Phase 8 (Continuous Deployment & Observability)

Cross-checks `references/*.md` against what Phase 8 actually shipped.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Warning  | 1     |
| Info     | 2     |

## Findings

### Warning-1 — `references/security-landmines.md` does not document the API-key scrubbing in error logs

`apps/web/src/lib/error-log.ts` introduces a new client-side defense: `sk-` / `sk-ant-` API keys appearing in a stack trace or message field are replaced with `<scrubbed>` before insert. This is a security-relevant invariant — a future contributor adding a new error-logging path should know the contract.

→ Add a new bullet to `references/security-landmines.md` § "Web client":
> Errors logged via `apps/web/src/lib/error-log.ts:logClientError` are scrubbed of `sk-` / `sk-ant-` patterns before insert. New error-logging paths should route through this helper rather than direct `supabase.from('client_error_log').insert(...)`.

→ Track as a follow-up doc-only commit, not blocking.

### Info-1 — `references/schema.md` updated correctly

The new `client_error_log` table is documented under § "tier_change_log (Phase 5)" → § "client_error_log (Phase 8)" with column types, defaults, indexes, and the deliberate "no SELECT policy" design note. Migration `0021` listed in § "Phase 8 migrations". No drift.

### Info-2 — `references/env-vars.md` updated correctly

New § "GitHub Actions (auto-deploy, Phase 8.2)" lists the five required repo secrets with sources. No drift.

## Not drift, but noted

- **`references/architecture.md` "Phases" table** still ends at Phase 6. Phases 7 and 8 are operational rather than feature-developmental and stay out of that table by the same convention applied at the Phase-7 audit. Consistent.
- **`references/repeaty-pwa.md`** — no Phase-8 changes affect PWA / Capacitor abstraction.
- **`references/deployment-landmines.md`** — its rollback paragraph (Vercel: `vercel rollback`) matches the deploy.yml workflow's behavior. The "Edge Functions" rollback note still says "from prior commit + redeploy" — `deploy.yml` does not yet automate this; manual recovery still applies. Documented in 8.2 § "Out of scope". No drift.
- **`references/api-contracts.md`** — no new Edge Function in this phase, so no contract changes.

## Blocking
None.
