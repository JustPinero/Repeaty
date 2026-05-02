# Drift Audit — Phase 7 (Deployment)

Cross-checks `references/*.md` against what shipped in Phase 7.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Warning  | 0     |
| Info     | 2     |

## Findings

### Info-1 — `references/deployment-landmines.md` — SPA rewrite snippet matches what shipped

The file's "Vercel" section already prescribed the `{ "source": "/(.*)", "destination": "/" }` pattern. `apps/web/vercel.json` ships the same. No drift.

### Info-2 — `references/env-vars.md` — Vercel "all three environments" rule honored

The reference says: *Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production, Preview, Development.* Verified via `vercel env ls` — six entries (3 envs × 2 vars), all encrypted. No drift.

## Not drift, but noted

- **`references/architecture.md` "Phases" table.** The table covers Phases 1–6. Phase 7 (deployment) is not in the table because Phase 7 is operational rather than feature-developmental. README's Status table now reflects Phase 7. Decision: do not add Phase 7 to architecture.md's Phases table; that table is for product feature scope, not ops cutover. (If a Phase 8 lands with feature work, it belongs in the architecture table.)
- **`references/deployment-landmines.md` health-check note.** The reference says *"Add a tiny `/healthz` Edge Function in Phase 6"* — that was not built. Tracked already in DEBT, not a Phase-7 drift.
- **No schema or API contract changes** in this phase, so `schema.md` and `api-contracts.md` are unaffected.

## Blocking
None.
