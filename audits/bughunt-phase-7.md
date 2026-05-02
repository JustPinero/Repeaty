# Bughunt — Phase 7 (Deployment)

Adversarial review of the deployment surface added in Phase 7: `apps/web/vercel.json`, `scripts/deploy-supabase.sh`, the README/manual-testing doc updates, and the production runtime as observed via `curl`.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Warning  | 1     |
| Info     | 3     |

## Findings

### Warning-1 — Production smoke script (`scripts/post-deploy-smoke.sh`) is referenced but not yet authored

`requests/phase-7-deployment/7.3-production-smoke.md` calls for `scripts/post-deploy-smoke.sh` to assert HTTP 200 on `/`, `/login`, `/manifest.webmanifest`, and a few JSON shape checks. The file does not exist. Today's manual `curl` checks confirmed those paths are 200 (see end-of-phase verification in commit `985cbce`), but there is no automated artifact future deploys can invoke.

Effect on Ben's first 30 minutes: none — the production URL is verified once. Effect on the next deploy: a regression in the SPA rewrite (e.g. someone removes `vercel.json`) ships silently until a user hits a deep link.

→ Track in `audits/debt.md` as DEBT-009 ("Author post-deploy smoke script") — unblocks before the second prod deploy, not the first.

### Info-1 — `apps/web/.gitignore` duplicates the root `.gitignore`'s new `.vercel` entry

Root `.gitignore` already gained `.vercel` in this commit. `apps/web/.gitignore` adds it a second time. Harmless; could be deleted in a later refactor pass.

### Info-2 — `vercel.json` declares `"framework": "vite"` but the live deploy is `--prebuilt`

The framework hint is honored by Vercel's normal build pipeline. We bypassed it with `vercel deploy --prebuilt --prod` because the cloud build hung on monorepo `pnpm install`. The hint is still correct for a future fallback to cloud builds, so keep it — but be aware it is currently unused by the actual deployment path.

### Info-3 — `Permissions-Policy: microphone=(self)` plus `camera=()` is correct, but no `geolocation` or `accelerometer` clamp

Repeaty does not use geolocation, accelerometer, gyroscope, magnetometer, payment, or USB. The Permissions-Policy header could explicitly deny each. Today's header denies camera and allows mic-self only, which is the threat-model-relevant subset; the rest is hardening.

## Not findings (looked, no issue)

- **Audio-retention `--no-verify-jwt`** — the function authenticates via the `apikey` header carrying `SUPABASE_SERVICE_ROLE_KEY`, and the Supabase Edge Function gateway treats service-role apikey as authenticated, so the default `verify_jwt=true` does not block service-role-apikey calls.
- **SPA rewrite catches `manifest.webmanifest`** — the `headers` block for `/manifest.webmanifest` runs *before* the `/(.*)` rewrite, so the manifest is served with `application/manifest+json` rather than `text/html`. Verified live (`curl -sI https://repeaty.vercel.app/manifest.webmanifest` returns the right Content-Type).
- **Vercel deployment protection** — confirmed unauthenticated curl returns 200 and serves the manifest. No SSO wall on the production URL.

## Blocking
None.
