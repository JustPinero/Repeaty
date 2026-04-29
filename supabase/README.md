# Supabase

Local stack: Postgres + Auth + Storage + Edge Functions, all run by `supabase start` (CLI v2). See `references/env-vars.md` for the secret-loading model.

```bash
supabase start          # boot local stack on default ports
supabase db push        # apply migrations
supabase functions serve score-pronunciation --no-verify-jwt   # for local dev only
```

## Layout

- `migrations/` — append-only SQL. Naming: `NNNN_description.sql`. See `references/schema.md` for intent.
- `functions/` — Edge Functions (Deno). One folder per function. See `references/api-contracts.md` for the wire contract.
- `tests/` — integration tests against a live local stack (created in Phase 1.2).
