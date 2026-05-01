# Fix — Confirm Phase-5 client-bundle delta against the < 500KB gz budget

**Severity:** Medium. Optimize Phase-5 Medium-3.

## Root cause

The Phase-5 audit-gate brief specifically asks for "Bundle-size impact of the new generate UI surface" coverage. The new client surface added this phase:

- `features/admin/` (AdminGuard, AdminPage, useAdminTierFlip)
- `features/generate/` (GenerateLessonPage, useGenerateLesson)
- `features/auth/useProfile.ts`

No new runtime deps; everything rides on existing shadcn / TanStack Query / react-router-dom. Expected delta is small, but unverified against the architecture's stated `< 500KB gzipped` main-bundle budget.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | A `pnpm --filter @repeaty/web build` artifact's gzipped main bundle is measured and recorded in this fix request (or a follow-up audit retrospective). |
| 2 | The delta vs the `main` branch's pre-Phase-5 build is reported. |
| 3 | If the main bundle is within ~5% of 500KB gz, propose lazy-loading `/app/admin` and `/app/generate` via `React.lazy` (these are infrequent routes). |
| 4 | If the bundle is comfortably under, no action — just record. |

## Files to touch

(Verification only; no source-code change unless lazy-loading is required.) Optionally:
- `apps/web/src/routes/index.tsx` — wrap `AdminPage` and `GenerateLessonPage` in `React.lazy(() => import(...))`.

## Out of scope

Tree-shaking review of shadcn primitives — pre-existing concern, deferred to Phase 6 PWA-launch budget squeeze.
