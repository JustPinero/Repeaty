---
name: drift-audit
description: Run after phase completion or on demand. Compares reference docs against actual code to detect discrepancies. Docs that don't match reality are dangerous.
---

# DriftAudit

## When to invoke
- End of every phase.
- After any course correction.
- On demand: `/drift-audit deep`.

## Modes
- **Quick** — references/ files vs files touched in the target phase.
- **Deep** — every file in references/ vs the entire codebase.

## What to compare
- `references/schema.md` ↔ `supabase/migrations/*.sql` and `packages/shared/src/types.ts`.
- `references/api-contracts.md` ↔ `supabase/functions/*/index.ts` (request/response shapes, status codes, auth requirements).
- `references/architecture.md` ↔ stack decisions actually shipped (deps in `package.json`, ADRs).
- `references/env-vars.md` ↔ `.env.example` ↔ actual usage in code (`import.meta.env.VITE_*`, `Deno.env.get(...)`).
- `references/repeaty-pwa.md` ↔ service worker config, Capacitor abstraction layer.
- `references/deployment-landmines.md` and `security-landmines.md` ↔ active stack/dependencies (e.g. don't carry Railway warnings if we don't use Railway).

## Scoring (Pass/Fail per file)
- **Pass** — doc accurately reflects current code.
- **Fail** — doc is outdated, missing recent additions, or contradicts implementation.

## Output
1. Report → `audits/drift-audit-phase-N.md` with per-file Pass/Fail and specific divergences cited.
2. **If docs drifted from code:** update the reference files directly in this audit run.
3. **If code drifted from intended design:** fix requests → `requests/phase-N-fixes/fix-drift-[short-desc].md`. Do NOT silently rewrite the reference to match drifted code without user sign-off.

## Blocking rule
**Fail on `schema.md` or `architecture.md` blocks the next phase.** These are load-bearing — drift here corrupts every downstream decision.
