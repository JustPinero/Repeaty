---
description: Defer a feature or request to a later phase. Usage `/defer [what to defer and why]`.
---

Deferral is a git-tracked feature flag. Instead of runtime conditionals, it uses reversible migrations and safe defaults (e.g. all users get `pro` tier during beta).

Sequence:

1. **Assign the next DEBT-ID** by reading `audits/debt.md` (find the highest existing `DEBT-NNN` and increment).

2. **Add an entry to `audits/debt.md`** under `## Open` with:
   - `## DEBT-NNN — <short title>`
   - `**Date deferred:** YYYY-MM-DD`
   - `**Originating phase / request:** Phase X — Request X.Y` (or "ad-hoc")
   - `**What was deferred:** <description>`
   - `**Why deferred:** <reason — out of scope, time, dep gap, etc.>`
   - `**To activate:** <numbered, concrete steps>`
   - `**Estimated effort:** <S/M/L>`
   - `**Reversal pointer:** <commit/migration/file refs>`

3. **If DB changes are needed for safe defaults:** create a reversible migration named `NNNN_defer_<feature>.sql`. The migration sets safe defaults (e.g. `ALTER TABLE profiles ALTER COLUMN tier SET DEFAULT 'pro'` during beta). Include a `-- ROLLBACK:` comment block at the bottom showing exactly how to reverse it.

4. **If code changes are needed for safe defaults:** apply them now — no runtime feature flag, just direct code changes that keep the deferred feature off and the alternative on.

5. **Push the migration if applicable** (`supabase db push`).

6. **Commit:** `chore(scope): defer <feature> — DEBT-NNN`.

7. **Confirm** what was deferred, the DEBT-ID assigned, and the steps to reactivate.
