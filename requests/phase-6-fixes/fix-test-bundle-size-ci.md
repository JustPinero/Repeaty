# Fix — Bundle-size guard is honor-system

**Severity:** Medium (test-audit-phase-6 Med-2 / optimize-phase-6 Med-2 — same scope)
**Originating audit:** Phase 6 test-audit + optimize
**Discovered:** 2026-04-30

## Root cause

`scripts/build-size-report.sh` was authored in Request 6.5 with a 500 KB gzipped main-bundle ceiling per `references/deployment-landmines.md`. The script works locally. But:

1. `apps/web/package.json` has no `build:size` task that runs the script.
2. The root `package.json` has no entry either.
3. `.github/workflows/ci.yml` does not invoke the script from any job.

Request 6.5's acceptance criteria explicitly required: "`pnpm build:size` task that emits the gz size of `dist/assets/index-*.js` to stdout; threshold < 500 KB. CI runs it on main."

Effect: the 500 KB ceiling is enforced only when a developer remembers to run the script manually. A regression that pushes the bundle past 500 KB lands silent until someone runs Lighthouse or notices a slow load.

## Acceptance criteria

- [ ] `apps/web/package.json` exposes a `build:size` script that runs `bash ../../scripts/build-size-report.sh`.
- [ ] Root `package.json` exposes a `build:size` that runs the same script (so `pnpm build:size` works at the repo root after a build).
- [ ] `.github/workflows/ci.yml` `build` job (or the `validate` job after a build) calls `pnpm build:size` and fails CI on non-zero exit. Non-`main` branches can short-circuit if needed (a branch-specific override only on `main` push is also acceptable; the request originally specified main-only).
- [ ] Verify locally that `pnpm --filter @repeaty/web build && pnpm build:size` succeeds and prints the gz total.

## Files to touch

- `apps/web/package.json`
- `package.json` (root)
- `.github/workflows/ci.yml`
