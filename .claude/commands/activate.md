---
description: Activate a previously deferred feature. Usage `/activate [DEBT-ID]`.
---

Reverses a `/defer`. Brings the feature back online.

Sequence:

1. **Read `audits/debt.md`** and find the specified `DEBT-NNN` entry under `## Open`. If not found there, check `## Resolved` — if it's already resolved, abort and tell the user.

2. **Follow the "To activate" steps** listed in the entry. Treat them as the source of truth — if reality has drifted from the plan, surface it to the user before proceeding.

3. **If a defer migration exists:** create a NEW migration to reverse it (don't edit the original — migrations are append-only). Name it `NNNN_activate_<feature>.sql`. Apply via `supabase db push`.

4. **Add/verify required env vars** in deployment platforms (Vercel, Supabase secrets). Run `/pre-deploy` to confirm.

5. **Test the activated feature.** Run the relevant tests (or write new ones if activation requires new acceptance criteria). All tests must pass before commit.

6. **Move the entry** from `## Open` to `## Resolved` in `audits/debt.md`. Add a `**Date resolved:** YYYY-MM-DD` line and a one-line note about how it was activated.

7. **Commit:** `feat(scope): activate <feature> — resolves DEBT-NNN`.
