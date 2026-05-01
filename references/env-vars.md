# Env Vars — Repeaty

No values here, only names and what they're for. Source of truth for `/pre-deploy` to validate against.

## Client-exposed (browser bundle, build-time)

These end up in the JS shipped to the user. **Never put a secret behind a `VITE_` prefix.**

| Var                       | Purpose                                                                    | Required for | Notes                                                                       |
| ------------------------- | -------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`       | Supabase project URL (e.g. `https://abcd.supabase.co`)                     | every env    | Public; safe to expose                                                      |
| `VITE_SUPABASE_ANON_KEY`  | Supabase anon JWT used for unauthenticated requests + as the auth bootstrap | every env    | Public by design — RLS protects the data                                    |
| `VITE_PLATFORM`           | Selects the platform adapter at module load. `web` (default) or `capacitor` (lands when DEBT-002 activates). | optional | Read by `apps/web/src/platform/index.ts`; unset/`web` → SpeechSynthesis-backed adapter |

## Server-only (Edge Functions / local Supabase CLI)

Set with `supabase secrets set KEY=VALUE` for cloud envs. Never `VITE_`-prefixed.

| Var                          | Purpose                                                                  | Required for                                              | Notes                                                                          |
| ---------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `SUPABASE_URL`               | Supabase project URL — server-side mirror of `VITE_SUPABASE_URL`         | Edge Functions                                            | Auto-injected by Supabase's Edge Function runtime; do not set manually. Read by `validateEnv()` at function boot. |
| `SUPABASE_ANON_KEY`          | Supabase anon JWT — server-side mirror used to construct user-context (RLS-respecting) clients inside Edge Functions | Edge Functions                                            | Auto-injected by Supabase's Edge Function runtime; do not set manually. Distinct from `SUPABASE_SERVICE_ROLE_KEY`. |
| `SUPABASE_SERVICE_ROLE_KEY`  | Full DB access, bypasses RLS                                             | Edge Functions, admin scripts                             | If this leaks, rotate immediately + audit `pg_stat_activity` for misuse        |
| `OPENAI_API_KEY`             | OpenAI API key (Whisper + ja/zh TTS)                                     | `score-pronunciation`, `tts-jazh` Edge Functions          | Format prefix `sk-`; `/pre-deploy` validates the prefix                        |
| `ANTHROPIC_API_KEY`          | Anthropic API key (Claude)                                               | `generate-lesson`, `generate-feedback`                    | Format prefix `sk-ant-`; `/pre-deploy` validates the prefix                    |
| `OPENAI_TTS_VOICE_JA`        | OpenAI tts-1 voice for Japanese (default `shimmer`)                       | `tts-jazh` (optional)                                     | One of: alloy, echo, fable, onyx, nova, shimmer. DEBT-003 active.              |
| `OPENAI_TTS_VOICE_ZH`        | OpenAI tts-1 voice for Mandarin (default `nova`)                          | `tts-jazh` (optional)                                     | Same set. Distinct from JA so users studying both hear different voices.       |

## Local development

`apps/web/.env.local` (and root `.env.local`) holds only the `VITE_*` vars. Server keys go to local Supabase via:

```bash
echo "OPENAI_API_KEY=sk-..." > supabase/.env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> supabase/.env
echo "SUPABASE_SERVICE_ROLE_KEY=..." >> supabase/.env
```

`supabase/.env` is gitignored; the local CLI reads from it when running Edge Functions locally.

## Production (Vercel + Supabase Cloud)

**Vercel:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **all three** environments (Production, Preview, Development). Missing on Preview is the most common cause of "PR deploys are blank".

**Supabase Edge Functions:**
```bash
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY=... \
  OPENAI_API_KEY=sk-... \
  ANTHROPIC_API_KEY=sk-ant-...
```
Verify with `supabase secrets list`.

## Startup validator

A Zod schema in `apps/web/src/env.ts` validates `import.meta.env.VITE_*` and throws a loud, named error at app boot if anything's missing. Same on the Edge Function side — each function imports a tiny `validateEnv()` helper from `_shared/`.

## Adding a new env var

1. Add to `.env.example` with an inline comment.
2. Add to this file.
3. Add to the relevant Zod env schema (client or server side).
4. Add to `scripts/validate-env.sh` `REQUIRED_*` arrays.
5. Set the value in Vercel + Supabase secrets for every environment that needs it.
