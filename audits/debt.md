# Debt Log — Repeaty

Every shortcut, deferred feature, and known compromise lands here. Reviewed at every phase-end audit. Use `/defer` to add an entry; use `/activate <DEBT-ID>` to bring something back online.

Format per entry:
- **DEBT-NNN — title**
- **Date deferred** / **Date resolved**
- **Originating phase / request**
- **What was deferred**
- **Why deferred**
- **To activate** (numbered concrete steps)
- **Estimated effort** (S/M/L)
- **Reversal pointer** (commit / migration / file refs)

---

## Open

### DEBT-001 — Stripe billing integration
- **Date deferred:** 2026-04-29
- **Originating phase / request:** Kickoff (pre-Phase-1 design decision; ADR-008)
- **What was deferred:** Real billing. Phase 5 ships a `tier` column on `profiles` (`free | pro | admin`) and an in-app `/admin` route to flip it manually. No Stripe SDK, no webhook, no `/pricing` route.
- **Why deferred:** v1 beta is a single user (the friend). Manual flips are sufficient. Stripe is multiple days of integration + verification work that doesn't move v1 forward.
- **To activate:**
  1. `pnpm add stripe @stripe/stripe-js` (server) and `@stripe/react-stripe-js` (client).
  2. Add Stripe env vars: `STRIPE_SECRET_KEY` (server), `VITE_STRIPE_PUBLISHABLE_KEY` (client), `STRIPE_WEBHOOK_SECRET` (server). Update `.env.example`, `references/env-vars.md`, `scripts/validate-env.sh`.
  3. Create `supabase/functions/stripe-webhook/index.ts` to receive `customer.subscription.*` events. Validate the signature.
  4. Add `subscriptions` table: `(id, user_id, stripe_subscription_id, status, current_period_end, ...)`. RLS: read-own.
  5. Update `profiles.tier` flip logic to be derived from `subscriptions.status` rather than admin-set. Migration: drop the manual `/admin` tier toggle (leave `is_admin` for other admin uses).
  6. Build `/pricing` route in `apps/web` with Stripe Elements for upgrade flow.
  7. Run `/pre-deploy production`, smoke-test the webhook with Stripe CLI's `stripe listen`.
- **Estimated effort:** L (3–5 days)
- **Reversal pointer:** No DB migration is set during defer (v1 simply hasn't built it). Activation creates new migrations; nothing to reverse.

### DEBT-002 — Native iOS/Android via Capacitor
- **Date deferred:** 2026-04-29
- **Originating phase / request:** Kickoff (pre-Phase-1 design decision)
- **What was deferred:** App Store / Play Store distribution. v1 ships PWA-only. Architecture (`apps/web/src/platform/` abstraction layer per ADR + `references/repeaty-pwa.md`) is in place from Phase 1, so activation is wrapping + native plugins, not a rewrite.
- **Why deferred:** Native distribution adds Apple Developer + Google Play setup, signing, App Store review, push-notification entitlements, and per-platform mic-permission UX. v1 PWA on the friend's phone is sufficient for beta validation.
- **To activate:**
  1. `pnpm add -D @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android`.
  2. `npx cap init Repeaty com.repeaty.app`.
  3. Implement `apps/web/src/platform/capacitor.ts` against `@capacitor/microphone`, `@capacitor/text-to-speech`, `@capacitor/local-notifications` etc. — interface defined in `references/repeaty-pwa.md`.
  4. Add `VITE_PLATFORM=capacitor` to native build pipeline.
  5. Apple Developer setup ($99/yr); configure signing in Xcode.
  6. Google Play Console setup ($25 once); configure signing in Android Studio.
  7. `npx cap sync && npx cap open ios` / `... open android`.
  8. Submit for review.
- **Estimated effort:** L (5–10 days incl. store reviews)
- **Reversal pointer:** No DB or code changes during defer. Activation adds new files only; no reversal needed.

### DEBT-003 — OpenAI TTS for Japanese / Mandarin
- **Date deferred:** 2026-04-29
- **Date resolved:** 2026-05-01 (post-launch maintenance pass)
- **Resolution:** `tts-jazh` Edge Function lands at `supabase/functions/tts-jazh/`. Pro/admin-only, daily cap 100/user via `bump_rate_limit('tts_jazh', 100)`, 200-char text cap, accepts only `lang ∈ {ja, zh}`, returns `audio/mpeg` bytes from OpenAI tts-1 with env-configurable voices (`OPENAI_TTS_VOICE_JA` / `OPENAI_TTS_VOICE_ZH`, default shimmer/nova). Per-request `Deno.serve` JWT-bind for the rate-limit RPC matches the Phase-5 pattern. `apps/web/src/platform/web.ts` `playTargetText` short-circuits to the Edge Function when the lang starts with `ja` or `zh`, plays the returned blob through a transient `<audio>` element, falls back to SpeechSynthesis silently on any failure (free-tier 403, rate-limited 429, transport, parse). In-memory blob cache keyed on `${lang}|${text}` so repeats don't re-call. 11 Deno tests on the handler. ~~_Open_~~
- **Originating phase / request:** Kickoff (ADR-004)
- **What was deferred:** Replacing the browser SpeechSynthesis API with OpenAI TTS (or Azure / ElevenLabs) for ja/zh, where browser quality is inconsistent. v1 uses browser TTS for all 7 languages.
- **Why deferred:** Adds per-call cost. Browser TTS is acceptable for ES/FR/DE/IT/RU and tolerable for ja/zh. Wait for real beta-user feedback (Pro tier feature when activated).
- **To activate:**
  1. Add `tts-jazh` Edge Function — proxies OpenAI TTS API. Use the same auth + Pro-tier gate pattern as `generate-feedback`.
  2. Add per-user daily cap to `rate_limits` (`bucket = 'tts_jazh'`).
  3. Update `apps/web/src/platform/web.ts` `playTargetText`: when `lang.startsWith('ja') || lang.startsWith('zh')`, fetch a TTS audio blob from the Edge Function and play via `<audio>` element instead of SpeechSynthesis.
  4. Cache audio blobs in Dexie (cache key: `${text}|${lang}|${voice}`); the same word phrase recurs across reviews.
  5. Add `OPENAI_TTS_VOICE_JA` and `OPENAI_TTS_VOICE_ZH` env vars (server-side); document in `references/env-vars.md`.
- **Estimated effort:** M (1–2 days)
- **Reversal pointer:** None. Activation adds; doesn't change defaults.

### DEBT-008 — Offline queueing for pronunciation attempts
- **Date deferred:** 2026-05-01
- **Date resolved:** 2026-05-01 (post-launch maintenance pass)
- **Resolution:** Dexie `pending_pronunciation_attempts` table (schema v2) carries the audio Blob + the eventual `uploaded_path`. `enqueuePronunciation` from `apps/web/src/lib/offline-queue.ts` persists; `usePronunciationSession.submitRecording` enqueues when `navigator.onLine === false` and surfaces the typed `OFFLINE_PRONUNCIATION_UNSUPPORTED` error so the page renders "saved offline — your score will land when you're back online" instead of a generic transport-failure UX. `useOfflineReplay`'s new `uploadAndScore` handler is two-staged: (1) upload via `uploadPronunciationBlob` if `uploaded_path` is empty, (2) invoke `score-pronunciation`. On partial failure (upload OK, function call fails) the resolved upload path persists in the queued row so the next attempt skips re-upload. The 5-attempt poison-pill drop applies. 5 new tests on offline-queue.test.ts cover the queue + replay shape; 1 new test on usePronunciationSession.test.ts covers the hook offline branch. ~~_Open_~~
- **Originating phase / request:** Phase 6 / Request 6.4
- **What was deferred:** `usePronunciationSession.submitRecording` does NOT enqueue to Dexie when offline — it currently lets the upload fail. Persisting the audio Blob in IndexedDB (Dexie supports it) is straightforward; the replay state machine on reconnect is the harder part because it needs to re-upload to Storage AND re-invoke `score-pronunciation` AND handle 401 re-auth between the two steps without losing the queued blob.
- **Why deferred:** v1 ships review + comprehension queueing. Pronunciation queueing is a multi-step replay (upload → invoke → write attempt row) where each step has its own failure modes. Beta validation will tell us if Ben actually uses pronunciation offline often enough to justify the extra ~200 LOC of replay state machine.
- **To activate:**
  1. Add `pending_pronunciation_attempts` Dexie table with a `Blob` column for the audio + the storage path that would have been written.
  2. Update `usePronunciationSession.submitRecording` with a `navigator.onLine === false` branch that enqueues the blob + card_id.
  3. Extend `useOfflineReplay`'s `replayPronunciation` handler: re-upload via `uploadPronunciationBlob`, then call `supabase.functions.invoke('score-pronunciation', ...)`. If the upload succeeds but the function call fails, leave the storage path in the queued row so a retry doesn't double-upload.
  4. Add integration tests covering: offline → enqueue → reconnect → flush; partial failure (upload OK, function down) → retry only the function call.
- **Estimated effort:** M (~1 day).
- **Reversal pointer:** No code change to revert; activation is additive.

### DEBT-007 — Remaining 9 Peaty mascot poses
- **Date deferred:** 2026-05-01
- **Status:** partially resolved (2026-05-01 — icon binaries landed; mascot poses still pending image generation).
- **Originating phase / request:** Phase 6 / Request 6.2
- **Partial resolution:** The 192/512/maskable PWA icons are now generated from the existing welcome-pose JPG via `scripts/build-peaty-icons.ts` (sharp-based, palette-encoded for ~78 KB total) and committed to `apps/web/public/peaty/peaty-icon-{192,512,maskable}.png`. `apps/web/public/manifest.webmanifest` carries three `image/png` entries (`purpose: any` for 192/512, `purpose: maskable` for the safe-zone 512). `apps/web/index.html` `<link rel="apple-touch-icon">` points at the 192 PNG. Regenerate via `pnpm build:icons` (root or apps/web). Smoke test at `scripts/build-peaty-icons.test.ts` asserts the committed binaries' dimensions; the script itself is **not** wired into `vite build` — it's manual.
- **What's still deferred:** The 9 unique mascot poses (`peaty-cheering`, `peaty-thumbs`, `peaty-empathy`, `peaty-mic`, `peaty-book`, `peaty-stopwatch`, `peaty-thinking`, `peaty-sleepy`, `peaty-magic`) plus `peaty-splash.jpg`. Phase-2 / 3 / 4 components still fall back to the welcome-pose JPG as a placeholder.
- **Why still deferred:** Pose generation needs an external image-gen tool against the character reference in `assets/peaty/peaty-poses.md`. Sharp-based transforms can't synthesize new poses, only resize the existing JPG.
- **To activate (remaining work):**
  1. Generate the 9 missing illustrations + `peaty-splash.jpg` per the table in `references/repeaty-pwa.md` § Mascot.
  2. Save each to `assets/peaty/` (design source-of-truth) AND `apps/web/public/peaty/` (served).
  3. Phase-2 / 3 / 4 components currently using `peat-start.jpg` placeholder swap to their dedicated poses (PeatyGreeting / Flashcard / Comprehension / Pronunciation headers).
  4. Re-run Lighthouse to confirm PWA installability is still green (icons landed in this partial; this step is to verify the pose swap didn't regress anything).
- **Estimated effort:** S (remaining, ≤ 0.5 day, almost all in image generation).
- **Reversal pointer:** No code change to revert; activation is additive.

### DEBT-006 — `pronunciation-session` E2E flow
- **Date deferred:** 2026-05-01
- **Date resolved (attempt 2):** 2026-05-01
- **Originating phase / request:** Phase 4 audit gate / chore(5.0)
- **Resolution:** Both races addressed. (1) Dashboard gained a "Your decks →" link (`apps/web/src/features/dashboard/Dashboard.tsx`); the spec clicks that instead of `page.goto('/app/decks')`, so same-app routing keeps the auth context warm. (2) MicCapture's recording-state branch carries a `data-testid="mic-recording"` attribute; the spec waits on the testid rather than the Stop button's accessible name, so the wait fires the moment the state machine transitions (the button repaint can lag the state change in headless Chromium). `e2e-manifest.json` flipped to `complete`.
- **What was deferred:** Flipping `pronunciation-session` to `complete` in `e2e-manifest.json`. The launchOptions args (`--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream`) and the spec body (Stop click → score panel) are wired and run locally, but the `/app/decks` step in the spec — clicking the "Pronunciation practice" link — is flaky in CI: the bundled-decks query hasn't settled by the time the locator times out at 15s. Likely a post-onboarding auth-context-hydration race when the navigation is `page.goto('/app/decks')` rather than a same-app link click.
- **Why deferred:** chore(5.0) bundled six other audit-deferred fixes; chasing the deck-list race without a CI trace artifact would have stalled the bundle. Reverting the manifest flip is the minimal safe move.
- **To activate:**
  1. Reproduce with Playwright trace on (`PWDEBUG=1` locally). The flake is between "onboarding complete" and "deck list visible".
  2. Hypothesis A: the spec navigates via `page.goto('/app/decks')` while the onboarding mutation is still in flight; switch to `page.getByRole('link', { name: /your decks/i }).click()` from the dashboard once it's visible (matches the flashcard-review pattern).
  3. Hypothesis B: a stale `decks` query enabled on a not-yet-hydrated `user.id`. Add `await expect(page.getByRole('heading', { name: /your decks/i })).toBeVisible()` before the link assertion.
  4. Re-run CI once locally green; flip the manifest entry to `complete`.
- **Estimated effort:** S (≤ 0.5 day with a CI trace in hand).
- **Reversal pointer:** `chore(5.0): revert pronunciation-session E2E to in-progress` (this commit). The launch-flag wiring + spec body stay; only the manifest entry reverts.

### DEBT-005 — Free-tier audio file blob cleanup
- **Date deferred:** 2026-04-30
- **Originating phase / request:** Phase 4 / Request 4.6
- **Resolution:** Edge Function `audio-retention` lands at `supabase/functions/audio-retention/`. Service-role-only (no browser path). Batches storage `remove()` in 100s, nulls paths for rows whose blobs successfully removed (failed-path rows stay for the next run to retry), structured-JSON log per call. Schedule: configure in the Supabase Dashboard → Database → Cron, daily 03:30 UTC (an hour after the existing `audio-retention-daily` pg_cron job that NULLs the paths). 7 Deno tests cover the contract. ~~_Resolution recap._~~
- **What was deferred:** Removing the underlying file blob from Supabase Storage when the daily retention job reaps a free-tier audio recording. The current `purge_free_tier_audio()` SQL function only NULLs `pronunciation_attempts.audio_storage_path`; the user-visible privacy property holds (no row references the audio, so the Play button disappears) but the file itself stays in `storage.objects`. Recent Supabase versions block direct `DELETE FROM storage.objects` from any role with a trigger ("Direct deletion from storage tables is not allowed. Use the Storage API instead.").
- **Why deferred:** The Storage API is HTTP-only — calling it from a SQL cron means adding `pg_net` (or equivalent) plus serializing the per-row HTTP DELETEs. Edge-Function path needs Supabase Cron schedule wiring outside the migration tree. Either is bigger than the 4.6 budget, and the v1 user-facing privacy property is satisfied by the path NULLing on schedule.
- **To activate:**
  1. Add `supabase/functions/audio-retention/index.ts` (Deno) — service-role client, SELECT stale free-tier rows, batch `supabase.storage.from('pronunciation-audio').remove(paths)`, UPDATE the rows.
  2. Schedule via Supabase Dashboard → Database → Cron, daily at 03:00 UTC. Document in `references/deployment-landmines.md`.
  3. Drop the `cron.schedule('audio-retention-daily', ...)` entry in a follow-up migration; rename `purge_free_tier_audio()` to a deprecation comment or drop entirely.
  4. Optionally: write a one-off migration that queues all currently-orphaned files (`audio_storage_path IS NULL` + a corresponding storage.objects row) into a `pending_storage_purge` table for the new Edge Function to drain on first run.
- **Estimated effort:** S (≤ 1 day)
- **Reversal pointer:** Migration `0013_audio_retention_path_only.sql` (drops the storage.objects DELETE from the SQL function). Activation adds an Edge Function + reschedule; no reverse migration needed.

### DEBT-004 — Phoneme-level pronunciation scoring
- **Date deferred:** 2026-04-29
- **Originating phase / request:** Kickoff (ADR-007)
- **What was deferred:** Replacing v1's normalized Levenshtein-on-Whisper-transcript scoring with phoneme alignment (e.g. forced alignment via WhisperX or kaldi-like systems). Better accuracy for accent training.
- **Why deferred:** Levenshtein-on-transcript is a known approximation that's "good enough" for a v1 beta. Phoneme-level adds substantial dependency footprint and processing time. Wait until real users want better feedback granularity.
- **To activate:**
  1. Choose tool: WhisperX self-hosted (heavy) vs Speechmatics / Azure phoneme endpoint (per-call cost) — re-evaluate at activation time.
  2. Update `score-pronunciation` Edge Function to call the phoneme service alongside Whisper, returning a per-phoneme similarity vector.
  3. Add `pronunciation_attempts.phoneme_scores` JSONB column (migration: `NNNN_add_phoneme_scores.sql`).
  4. Update similarity score computation to weight phoneme errors by salience (consonant-vowel boundaries, tone for zh).
  5. UI: per-phoneme highlight in attempt history (which sounds did the user miss?). New component in `features/pronunciation/`.
  6. Update `bughunt` skill to add new RLS check on the JSONB column.
- **Estimated effort:** L (5–8 days)
- **Reversal pointer:** None during defer. Activation adds a new migration; not reversed in normal flow.

---

## Resolved

### DEBT-011 — Manual rollback runbook in deployment-landmines.md
- **Date deferred:** 2026-05-05
- **Date resolved:** 2026-05-05
- **Originating phase / request:** Phase 8 audit (`audits/bughunt-phase-8.md` Warning-2)
- **Resolution:** New § "Auto-deploy rollback recovery" in `references/deployment-landmines.md` documents the manual recovery sequence when `deploy.yml`'s automatic `vercel rollback` step fails: smoke locally to confirm breakage, `vercel ls --prod` for known-good, `vercel redeploy <url> --prod`, resmoke. Includes the path for regenerating + re-setting `VERCEL_TOKEN` from 1Password. Forward-fix migration note links back to the existing forward-only rule.

### DEBT-010 — Rename ci.yml `production-smoke` job for timing clarity
- **Date deferred:** 2026-05-05
- **Date resolved:** 2026-05-05
- **Originating phase / request:** Phase 8 audit (`audits/bughunt-phase-8.md` Warning-1)
- **Resolution:** Job renamed to `live-smoke` in `.github/workflows/ci.yml`; `scripts/test-ci-config.test.ts` updated to assert the new key; comment block in ci.yml clarifies the timing semantics ("validates the deploy that is live NOW, before any new artifact ships from the deploy.yml pipeline triggered by this run").

### DEBT-009 — Author post-deploy smoke script
- **Date deferred:** 2026-05-01
- **Date resolved:** 2026-05-04
- **Originating phase / request:** Phase 7 audit (`audits/bughunt-phase-7.md` Warning-1, `audits/test-audit-phase-7.md` Warning-1)
- **Resolution:** `scripts/post-deploy-smoke.sh` lands. Asserts HTTP 200 on `/`, `/login`, `/signup`, `/app`; manifest body matches `.name == "Repeaty"`; manifest Content-Type is `application/manifest+json`; `sw.js` Cache-Control contains `must-revalidate`; every Edge Function (`flip-tier`, `score-pronunciation`, `generate-feedback`, `generate-lesson`, `tts-jazh`, `audio-retention`) returns 401 to a no-auth POST. Wired into root `package.json` as `pnpm smoke`. Defaults to the production URL + cloud project ref so `pnpm smoke` is a one-word post-deploy gate.
