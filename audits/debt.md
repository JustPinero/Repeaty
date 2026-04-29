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

(none yet)
