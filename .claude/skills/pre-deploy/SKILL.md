---
name: pre-deploy
description: Run before deploying to any environment. Validates env vars, checks deployment config, runs stack-specific pre-deploy checklist.
---

# Pre-Deploy

Triggered by `/pre-deploy [environment]` (default: `production`).

## Sequence

### 1. Read landmines
- `references/deployment-landmines.md` — Vercel + Supabase + LLM-specific gotchas.
- `references/security-landmines.md` — input validation, RLS, prompt injection.

### 2. Validate env vars
- Run `bash scripts/validate-env.sh <environment>`.
- For Vercel: list every required `VITE_*` and confirm it's set in the target environment (Prod/Preview/Dev).
- For Supabase Edge Functions: list every server-only secret and confirm via `supabase secrets list`.
- Output table: ✅ set / ❌ missing / ⚠️ wrong scope (e.g. server key under `VITE_` prefix — fail hard).

### 3. Stack-specific pre-deploy checklist (Vercel + Supabase + LLM)

**Vercel (frontend):**
- [ ] SPA rewrite rule present (`vercel.json` or framework default for Vite SPA) — client-side routing must work on direct URLs.
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set for Production AND Preview AND Development environments.
- [ ] No server keys (Whisper, Claude, service role) under any `VITE_*` prefix.
- [ ] CSP headers (if configured) include Supabase domain (`*.supabase.co`) and any TTS/audio sources.
- [ ] Build output size sanity-check (warn if main bundle > 500KB gzipped).

**Supabase Edge Functions:**
- [ ] All required secrets set: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Each function deployed and reachable (curl with valid JWT returns 200 or expected 4xx — not 500/timeout).
- [ ] AbortController timeout (15s) confirmed in code for every external API call.
- [ ] Per-user rate limit logic confirmed for paid-tier functions.

**Supabase database:**
- [ ] All migrations applied to target env (`supabase db diff` returns clean).
- [ ] RLS enabled on every user-owned table (auto-check via SQL: `SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity = false;` — must return zero rows for user tables).
- [ ] Storage retention policy (7-day audio cleanup) confirmed enabled.

**LLM/Whisper:**
- [ ] Per-user daily caps configured.
- [ ] Markdown-fence-stripping in place for all Claude JSON responses.
- [ ] Zod validation on all LLM-returned shapes.
- [ ] Feedback caching enabled (cache key: `card_id + error_pattern`).

### 4. Secret leak check
- `git grep -E '(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9-]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})' -- ':!*.lock' ':!references/' || echo "no leaks"` — must say "no leaks".

### 5. Run validate.sh
- `bash scripts/validate.sh` — same checks as CI. Must be green.

### 6. Output report
Format:
```
PRE-DEPLOY REPORT — <env> — <timestamp>

✅ PASSING (12)
- env-vars: all required vars set
- ...

❌ FAILING (1)
- supabase-rls: profiles table has RLS disabled
  → fix: ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

⚠️ WARNINGS (2)
- bundle-size: main bundle 612KB gzipped (threshold 500KB)
  → consider lazy-loading the pronunciation feature

DEPLOY RECOMMENDATION: 🚫 BLOCK (1 critical failing)
```

If any check fails, **block the deploy recommendation** and list specific fixes.
