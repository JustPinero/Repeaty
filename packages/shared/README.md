# @repeaty/shared

Cross-cutting types, Zod schemas, and the FSRS scheduling implementation. Imported by both `apps/web` and `supabase/functions/*`.

Scaffolded by [Request 1.1](../../requests/phase-1-foundation/1.1-monorepo-scaffold.md). Generated DB types land in 1.2 via `pnpm gen:types`.

Planned exports (by phase):
- `version` — sanity import target (1.1)
- `db-types.ts` — generated from Supabase schema (1.2)
- `languages.ts` — supported languages, CEFR levels (1.4)
- `fsrs.ts` — FSRS scheduling state machine (Phase 2)
- `validators.ts` — `isValidSlug`, `isValidUrl`, `isWithinLength`, `sanitizeForShell` (per `references/security-landmines.md`)
- `edge-errors.ts` — error code enum for Edge Functions (Phase 4)
- `lesson-schemas.ts` — Zod schemas for AI-generated lessons (Phase 5)
