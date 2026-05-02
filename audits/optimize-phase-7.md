# Optimize — Phase 7 (Deployment)

Performance / cost / runtime audit of the deployed surface.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Warning  | 0     |
| Info     | 3     |

## Findings

### Info-1 — Bundle size on first prod deploy is 221.50 KB gz (main chunk)

From the local Vite build: `dist/assets/index-CmRZCHuS.js  756.08 kB │ gzip: 221.50 kB`. Well under the 500 KB gz ceiling enforced by `pnpm build:size`. Headroom for 5.4 / 5.6 / Capacitor activation later.

### Info-2 — `sw.js` cache headers are correct

`Cache-Control: public, max-age=0, must-revalidate` — every visit revalidates, which is the right posture for a service worker file (otherwise users get pinned to old SWs after a deploy and need a manual refresh). Verified via `curl -sI https://repeaty.vercel.app/sw.js`.

### Info-3 — Manifest cache is `max-age=3600`

One-hour manifest cache is reasonable for v1: Repeaty's manifest is stable (icon/name/colors only), and PWA install prompts ask the manifest at install time, not per-page-load. If we ship a manifest update post-launch (icon swap, theme color tweak), users see it within the hour without a forced reload.

## Cost / runtime

- **Vercel:** the linked project is on Hobby tier; static assets only. No serverless functions on Vercel — all dynamic logic is in Supabase Edge Functions. Bandwidth: negligible at v1 scale (one user).
- **Supabase Edge Functions:** 6 deployed. Cold start ≈ 500 ms (per `references/deployment-landmines.md`). Acceptable for Whisper / Claude paths (already 2-3s upstream); on the hot path of `score-pronunciation` it adds noise but does not dominate.
- **Storage:** `pronunciation-audio` bucket retention is wired via pg_cron (NULLs path) and `audio-retention` Edge Function (removes blob). The cron schedule itself is **not yet configured in the Cloud dashboard** — flagged in `audits/bughunt-phase-7.md` Info area.

## Blocking
None.
