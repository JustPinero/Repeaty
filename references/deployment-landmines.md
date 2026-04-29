# Deployment Landmines — Repeaty (Vercel + Supabase + Claude/Whisper)

Stack-specific gotchas. Read before every deploy. `/pre-deploy` enforces.

## Vercel (frontend)

- **SPA rewrite is mandatory.** Vite + React + client-side routing breaks on direct URL hits unless every path falls back to `index.html`. Add `vercel.json`:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
  ```
  Without this, `/dashboard` returns 404 on a fresh load.

- **`VITE_*` vars are baked at build time.** They live in the JS bundle. Two consequences:
  1. Changing them requires a redeploy — runtime updates do nothing.
  2. **Never put a secret behind a `VITE_` prefix.** It's literally shipped to every browser.

- **Set env vars for every environment.** Vercel has Production, Preview, Development. Missing one is the most common cause of "PR deploys are blank but main works." Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to all three.

- **CSP must include Supabase domain.** If we add a strict Content Security Policy, `connect-src` needs `*.supabase.co` and any storage CDN. Browsers fail silently in dev tools — easy to miss.

- **Bundle size can balloon.** shadcn/ui imports per-component (good); some libraries (date-fns, lodash) need explicit subpath imports to tree-shake. Watch the build summary; warn if main bundle > 500KB gzipped.

- **Don't lazy-load the audio recording flow.** Mic permission UX is fragile; lazy chunk loads on first record can introduce a perceptible pause that users misread as "it's not listening." Inline.

## Supabase

- **RLS-without-policies = locked down.** Enabling RLS on a table without writing policies means *no one* (including the table owner) can read or write via the anon/authenticated keys. The migration that enables RLS must include the policies in the same transaction.

- **Service role key bypasses RLS.** Treat it like a god-mode credential. Server-only. Never `VITE_`-prefixed. Never logged. If it leaks, rotate via the Supabase dashboard and audit `pg_stat_activity` for misuse.

- **Edge Functions have a cold start.** First call after idle can be ~500ms slower. Acceptable for Whisper/Claude (already slow). Don't put it on the read path of the dashboard.

- **Storage retention is policy-driven.** Audio files don't auto-expire. Wire a Postgres cron job (Supabase pg_cron) or a daily Edge Function to delete files older than 7 days for free-tier users.

- **Local CLI vs cloud parity.** `supabase start` runs Postgres + GoTrue + Storage + Edge Functions locally. Schema is identical, but Edge Function secrets are read from `supabase/.env` locally vs `supabase secrets` in cloud. `/pre-deploy` checks both.

- **Trigger-created `profiles` row.** The `on_auth_user_created` trigger needs to handle email being null briefly during OAuth flows (future). Use `COALESCE(NEW.email, '')` to avoid trigger crashes on signup.

## Claude / Whisper / LLM API

- **API keys server-side ONLY.** Use Edge Function proxies. Never `VITE_*`. The pre-commit secret check blocks accidental commits, but the cleanest defense is never to write them client-side in the first place.

- **Always strip markdown fences before `JSON.parse`.** Even with `response_format: json_object`, models occasionally wrap output in ```` ```json ... ``` ````. Helper:
  ```ts
  const stripFence = (s: string) =>
    s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  ```

- **Always wrap LLM JSON parse in try/catch.** Model returned malformed JSON ≠ infrastructure failure. Surface as `UPSTREAM_FAILED` with the raw response logged.

- **AbortController timeout (15s) on every external API call.** Without it, an upstream hang ties up an Edge Function until Supabase's hard limit kills it — by which point the user has refreshed three times.

- **Rate limit per-user AND globally.** Per-user caps stop one user from running up the bill. A global daily cap (`rate_limits` row keyed on `bucket = 'global'`) is a circuit breaker for cost runaways.

- **Cache successful responses.** Feedback for the same card + error pattern + native language is identical across users. Cache hits cost nothing and respond in <50ms vs 2-3s for a fresh call.

- **Cost-per-call logging.** Every Edge Function logs `cost_estimate_usd` in its structured log. Build a dashboard query later; don't try to add it after the bill is unexpected.

## Cross-cutting

- **Env validation at startup with Zod.** Both client (`apps/web/src/env.ts`) and Edge Functions (`_shared/validateEnv.ts`). Crash loud at boot if anything's missing — silent failures at runtime are worse.

- **`.env.example` is committed; `.env*` (without `.example`) is gitignored.** New contributors should be able to copy-and-fill in <60 seconds.

- **Graceful shutdown.** Edge Functions are stateless, so this is easy here. Just make sure no AbortController is missing (a hung fetch can survive a function exit on some runtimes).

- **Health check.** Add a tiny `/healthz` Edge Function in Phase 6 that returns `{ ok: true, db: 'ok' }` after a `SELECT 1`. Vercel's preview-deploy smoke test can hit it.

- **Post-deploy smoke tests.** CI runs `pnpm validate` pre-merge; after deploy, an external smoke (curl `/healthz`, sign up a throwaway account, run one E2E flow) catches env-var-only failures.

- **Never use `echo X >> .env` in CI.** It expands shell variables and can leak secrets into logs. Use `printf` or a dedicated tool (Vercel CLI / `supabase secrets set`).

- **Git secrets check.** Pre-commit hook scans staged changes for `sk-`, `sk-ant-`, `ghp_`, `AKIA` patterns. See `scripts/hooks/pre-commit-secret-check.sh`.

## What we're NOT doing (so don't waste time on these)

- We're **not** on Railway → ignore Railway-specific hints (trust proxy, healthcheck timeout, project tokens).
- We're **not** on Docker → ignore single-stage build / .npmrc / Prisma-in-Docker tips.
- We're **not** using Prisma → ignore `prisma generate` ordering.
- We're **not** using Socket.io / WebSockets → no CORS-mismatch silent failures to worry about.
- We're **not** on Expo / React Native in v1 → Capacitor wrap (DEBT-002) brings its own gotchas, file then.
