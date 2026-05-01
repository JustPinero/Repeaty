# Drift Audit — debt-cleanup branch (PR #1)

Reconcile docs vs code on the surface this branch touched: DEBT log status, references for new dependencies, references for the offline-queue impl + ja/zh TTS path.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 1     |
| Low      | 3     |

## DEBT log status reconciliation

Audit brief specifies expected status per DEBT. Actual file is `audits/debt.md`.

| ID | Brief expectation | `audits/debt.md` actual | Status |
| -- | ----------------- | ----------------------- | ------ |
| DEBT-001 (Stripe) | resolved | listed under "## Open"; no `Date resolved`; no resolution paragraph | **wait — see Med-1** |
| DEBT-002 (Capacitor) | resolved | listed under "## Open"; no `Date resolved` | **wait — see Med-1** |
| DEBT-003 (TTS ja/zh) | resolved | `Date resolved: 2026-05-01`, full Resolution paragraph, ~~_Open_~~ strikethrough | ✓ |
| DEBT-004 (phoneme scoring) | open | listed under "## Open"; no resolution paragraph | ✓ |
| DEBT-005 (audio cleanup) | resolved | full Resolution paragraph; ~~_Resolution recap._~~ strikethrough; **but still under "## Open"** | partial (Low-1) |
| DEBT-006 (E2E flake) | open | full Resolution paragraph mentions Hypothesis B applied + ~~_Open_~~, **but** the Resolution body is now stale because commit `5306820` reverted it. Status row says nothing about the revert. | **drift — see Med-1** |
| DEBT-007 (mascot poses) | partial | `Status: partially resolved (2026-05-01 — icon binaries landed; mascot poses still pending image generation)`, "Partial resolution" + "What's still deferred" sections | ✓ |
| DEBT-008 (pronunciation offline) | resolved | `Date resolved: 2026-05-01`, full Resolution paragraph, ~~_Open_~~ strikethrough; **but still under "## Open"** | partial (Low-1) |

### Med-1 — DEBT-006 entry's Resolution paragraph contradicts the manifest revert

`audits/debt.md:99–111` carries: "**Date resolved:** 2026-05-01 (post-launch maintenance pass) … **Resolution:** Hypothesis B applied … `e2e-manifest.json` flipped back to `complete`. ~~_Open_~~"

But commit `5306820` (`fix: revert pronunciation-session E2E to in-progress (DEBT-006 still open)`) reverted the manifest flip. `e2e-manifest.json:21` now reads `"status": "in-progress"`. The audit brief explicitly says DEBT-006 is "still open" / "Re-deferred — the Hypothesis-B fix didn't take in CI."

The DEBT entry's Resolution paragraph is now wrong. It claims the fix landed; the fix actually got reverted. Reader of the file at HEAD has no way to know without reading commit history.

→ Fix request: `requests/post-merge-fixes/fix-drift-debt-006-resolution-revert.md`

(Cosmetic but semantically load-bearing — the DEBT log is the source of truth for what's actually done. Severity Medium because the file is the canonical "what's deferred" record and a wrong status here is exactly the kind of drift this audit exists to catch.)

## Architecture / Dependency log

`references/architecture.md` § Dependency log — audit brief asks to confirm `dexie`, `sharp`, `vite-plugin-pwa` are listed.

| Package | In `architecture.md` Dependency log? | Source |
| ------- | ------------------------------------ | ------ |
| `dexie` | ✓ — listed under "Installed in Request 6.3 (Workbox service worker) and 6.4 (Dexie offline queue)" with version + reason | `architecture.md` |
| `vite-plugin-pwa` | ✓ — same section as `dexie` | `architecture.md` |
| `sharp` | ✗ — NOT listed | gap — see Low-2 |

### Low-2 — `sharp` not in the Dependency log

`package.json:33` adds `"sharp": "^0.34.5"` to root `devDependencies`. `architecture.md`'s Dependency log doesn't mention it. The log has a "Phase 6.3 / 6.4 install" section but `sharp` landed post-Phase-6 (this branch).

Per `architecture.md`'s top-of-section rule ("Every new dependency added after kickoff appends a row here"), this is a missed append. Worth one row under a new "Installed post-Phase-6 (debt-cleanup branch)" section: package, version, reason (PWA icon generation from welcome-pose JPG), considered (ImageMagick CLI, hand-resize), cost (dev-only — devDependency, not in runtime bundle).

→ Fix request: `requests/post-merge-fixes/fix-drift-architecture-sharp-dep.md`

## Offline-queue references reconciliation

Audit brief asks to verify `references/repeaty-pwa.md` § Offline queue matches the actual impl (which the offline-queue agent's commit description claims to have done).

`references/repeaty-pwa.md` § Offline queue (lines 142–159 of that file) currently says:

> Dexie holds two queues in v1:
> - `pending_reviews` — review ratings the user submitted while offline. … current behavior is "client wins on the upsert" …
> - `pending_comprehension_attempts` — small JSON payloads. …
>
> `pending_pronunciation_attempts` was scoped for v1 but is deferred to DEBT-008 — re-uploading the audio Blob plus re-invoking score-pronunciation plus handling 401 between the two steps is a meaningfully larger replay state machine …

### Low-3 — `repeaty-pwa.md` § Offline queue still describes pronunciation queueing as deferred

The doc says "pronunciation queueing is deferred to DEBT-008". DEBT-008 has been resolved on this branch (Dexie schema v2, two-stage replay state machine, `usePronunciationSession.submitRecording` enqueueing on `navigator.onLine === false`). The `references/repeaty-pwa.md` text is stale.

The replay-conflict-resolution drift fix-request was deleted (and its successor pin-test landed in `offline-queue.test.ts`), but the broader doc still treats pronunciation queueing as future work.

The offline-queue implementation file (`apps/web/src/lib/offline-queue.ts`) has a strong JSDoc header that documents the current state correctly. The pwa.md surface wasn't updated to match.

→ Fix request: `requests/post-merge-fixes/fix-drift-repeaty-pwa-pronunciation-queue.md`

## env-vars references

`references/env-vars.md` was touched on this branch (in the diff). Verifying:

- `OPENAI_TTS_VOICE_JA` — ✓ listed with default `shimmer`, "DEBT-003 active" note.
- `OPENAI_TTS_VOICE_ZH` — ✓ listed with default `nova`.
- `OPENAI_API_KEY` purpose — ✓ updated to "Whisper + ja/zh TTS".

env-vars.md is fully reconciled with the new Edge Function. ✓

## api-contracts references

`references/api-contracts.md` was NOT in the diff. Spot check:

- `tts-jazh` Edge Function — NOT documented in api-contracts.md. The doc lists `score-pronunciation`, `generate-lesson`, `generate-feedback`, `flip-tier`. `tts-jazh` is the 5th Edge Function and the contract doc's intro line "Four Edge Functions" is now wrong.
- `audio-retention` — service-role-only, called by Cron not browsers. Could be omitted from api-contracts.md since the doc opens with "All require a valid Supabase JWT" — `audio-retention` doesn't fit that frame. Could go in `deployment-landmines.md` instead. Currently in neither doc.

### Low-1 — `api-contracts.md` doesn't mention the two new Edge Functions

`tts-jazh` is browser-callable and has a real request/response contract (request body Zod schema, four error codes, audio/mpeg response). It belongs in api-contracts.md under "Pro-only" alongside `generate-lesson` / `generate-feedback`. `audio-retention` is service-role-only and might best be one paragraph in `deployment-landmines.md` § Supabase rather than api-contracts.md.

The intro line "Four Edge Functions" in `api-contracts.md` is technically wrong now (there are five browser-callable + one cron-only). Worth a one-line update + an api-contracts entry for `tts-jazh`.

→ Fix request: `requests/post-merge-fixes/fix-drift-api-contracts-new-edge-fns.md`

## Re-confirmed in sync

- `references/schema.md` — no migration touched on this branch (DEBT-003 / DEBT-005 / DEBT-008 are all Edge Function or client-side; DEBT-007 is asset binaries). ✓
- `references/security-landmines.md` — patterns referenced by `tts-jazh` (rate-limit per-user-and-globally, AbortController timeout, validate body with Zod) are all already documented. ✓
- `references/deployment-landmines.md` — already mentions DEBT-005's Edge Function path under § Supabase. Could be clarified that `audio-retention` now exists, but the doc reads correctly as written. ✓
- `audits/debt.md` cosmetic note: DEBT-005 + DEBT-008 + DEBT-003 sit under "## Open" with `Date resolved` markers and `~~_Open_~~` strikethroughs. The convention in the file footer says "## Resolved (none yet)". The convention is to move resolved entries to the Resolved section, but the strikethrough-and-stay-in-Open pattern is what this repo has been doing post-Phase-6. Not a drift; it's the established style. (Worth a future cleanup pass to actually move them, but not in scope here.)
