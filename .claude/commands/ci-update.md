---
description: Update CI workflow with latest action versions and sync with current test manifest. Usage `/ci-update`.
disable-model-invocation: true
---

Sequence:

1. **Search the web** for the latest stable versions of every GitHub Action used in `.github/workflows/ci.yml`. Specifically check:
   - `actions/checkout`
   - `actions/setup-node`
   - `pnpm/action-setup`
   - `supabase/setup-cli`
   - `actions/cache`
   - any other third-party actions in the workflow

2. **Update action versions** in the workflow file. Pin to a specific tag (e.g. `@v4`), not a SHA — Repeaty isn't a security-critical project and tag pinning is friendlier for contributors.

3. **Sync E2E test list** — read `e2e-manifest.json` and verify the workflow's E2E job matrix includes every flow with `status: complete`. Skip flows that are `not-started` or `in-progress`.

4. **Verify `scripts/validate.sh` matches CI checks** — every step CI runs locally must also run in `validate.sh`. If they diverge, update `validate.sh` (single source of truth — see CLAUDE.md).

5. **Commit:** `[infra] update CI action versions and sync e2e manifest`.

Do NOT skip step 1. Action versions go stale fast and outdated versions cause silent failures.
