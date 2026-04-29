# DriftAudit — Phase 1 (foundation)

Mode: quick. Scope: `references/*.md` ↔ files modified between `main` and `phase-1-foundation` HEAD.

## Per-file Pass/Fail

| Reference file                          | Pass/Fail | Notes                                                                                                                          |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `references/architecture.md`            | **Pass**  | ADRs match shipped stack. Dependency log mentions every dep present in `apps/web/package.json`. The forward-looking `apps/web/src/platform/` directory is described as the eventual location, not as currently shipped — Phase 1 code touches no `navigator.*` so no contract is violated yet. |
| `references/schema.md`                  | **Pass (after fix applied in this run)** | Phase-1 migrations list was missing `0007_onboarding_rpc.sql`. The RPC itself was already documented under § Auxiliary. List corrected in this audit. `display_name` correctly reflected as NULL (matches `0001_init_profiles.sql`). |
| `references/api-contracts.md`           | **Pass**  | No Edge Functions in Phase 1 scope. Document is forward-looking only.                                                          |
| `references/env-vars.md`                | **Pass**  | The two client-exposed vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) match `.env.example` and `apps/web/src/env.ts`. Server-side vars are listed but not in Phase 1 scope. |
| `references/repeaty-pwa.md`             | **Pass**  | Mascot section correctly identifies `peat-start.jpg` as the only Phase-1 pose. The `apps/web/public/peaty/peat-start.jpg` file exists. Platform abstraction section is forward-looking. |
| `references/deployment-landmines.md`    | **Pass**  | Stack-specific (Vercel + Supabase + Claude/Whisper). No Railway / Docker / Prisma noise. SPA rewrite advice is correct (and not yet wired — `vercel.json` doesn't exist; not blocking until first deploy in Phase 6). |
| `references/security-landmines.md`      | **Pass (after fix applied in this run)** | Was claiming "Phase 1.1 wires the import path" for `packages/shared/src/validators.ts` — that file does not exist. Updated to clarify the section is a spec for the request that first needs the helpers (likely Phase 4). |

## Divergences corrected in this audit run

### D1 — `references/schema.md` Phase-1 migrations list missing `0007_onboarding_rpc.sql`
**Before:** Phase 1 migrations enumerated `0001` through `0006` only.
**After:** Added `0007_onboarding_rpc.sql — complete_onboarding RPC` line, cross-linked to § Auxiliary where the RPC is already documented.
**Action:** doc updated in this audit. No code change.

### D2 — `references/security-landmines.md` claimed `packages/shared/src/validators.ts` is wired in Phase 1.1
**Before:** "(Phase 1.1 wires the import path; this file is the spec.)"
**After:** Clarified that the section is a spec for the future request that first needs one of the helpers (Phase 4 path-traversal guard is the most likely activator).
**Action:** doc updated in this audit. No code change. The spec stays valid; only the wiring claim was wrong.

## Things looked-at and cleared
- **Schema↔migration alignment:** every column type, default, CHECK constraint, FK, and index documented in `schema.md` matches its migration. Specifically verified:
  - `profiles.display_name TEXT NULL` ↔ `0001_init_profiles.sql:16` (`display_name text`, no `not null`).
  - `profiles.tier` CHECK with `'free'|'pro'|'admin'` ↔ `0001:19`.
  - `decks_owner_matches_source` CHECK ↔ `0003:16–19`.
  - `reviews UNIQUE (user_id, card_id)` ↔ `0004:16`.
  - `pronunciation_attempts.similarity_score` 0..1 CHECK ↔ `0005:11`.
  - `complete_onboarding` RPC signature `(text, text, jsonb) returns void`, `security invoker`, `grant execute to authenticated` ↔ `0007:11–17, 73`.
- **RLS policies:** every policy in `schema.md` (including the `profiles` UPDATE-with-pinned-tier pattern) matches `0006_rls_policies.sql` line-for-line.
- **Architecture ADRs:** ADR-001 (Vite over Next.js) ✓, ADR-002 (Supabase) ✓, ADR-003 (pnpm workspaces — confirmed `pnpm-workspace.yaml` and the workspace structure) ✓, ADR-005 (Zustand) ✓ (used in `useOnboardingState` and `useActiveLanguage`), ADR-009 (TanStack Query) ✓ (used in `useAuthUser`, `OnboardingGuard`, `Dashboard`).
- **Dependency log accuracy:** all packages installed in 1.1, 1.2, 1.3, 1.4 are listed in `architecture.md`'s Dependency log with the right phase assignment. No undocumented deps in `package.json` beyond what the log claims.
- **Env vars:** `apps/web/src/env.ts` validates exactly the two vars `env-vars.md` calls "Client-exposed". No `VITE_*` server-key smell.
- **Mascot:** `apps/web/public/peaty/peat-start.jpg` exists; PeatyGreeting consumes it; alt text is descriptive ("Peaty the parrot waving hello").
- **PWA notes:** Service worker, Capacitor abstraction, install prompt all forward-looking. No Phase-1 code violates them.

## Note about the known-fixed issue
The orchestrator's context flagged that during Request 1.4 the Edit to `routes/index.tsx` (wrapping `/app/*` in `<OnboardingGuard>`) silently failed and was fixed in 1.5. As of HEAD, `apps/web/src/routes/index.tsx:14–22` does wrap `<RequireAuth>` → `<OnboardingGuard>` → `<Dashboard>` correctly. **No drift remaining; not flagged.**

## Blocking findings
None. Both updated docs were "doc drifted from code" cases (skill rule: update the reference files directly in this run, no fix-request needed). No "code drifted from intended design" cases requiring a fix-request.

## Fix-request files generated
None — the two divergences were doc-only and updated in this audit run.
