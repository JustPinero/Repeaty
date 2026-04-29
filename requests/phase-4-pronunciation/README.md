# Phase 4 — Pronunciation Mode (Whisper)

In-browser mic capture (MediaRecorder via the platform abstraction so Capacitor swap is clean), audio uploaded to Supabase Storage with 7-day retention for free tier, `score-pronunciation` Edge Function calls OpenAI Whisper with the target language code, returns transcript + similarity score against expected text (Levenshtein for v1; phoneme upgrade is DEBT-004). Per-card pronunciation history with playback of past attempts.

**Exit criteria:** A user can record their pronunciation, hear their own playback, see a similarity score and Whisper transcript, and history persists per card. Storage retention policy verified. Mic permission flow works on Chrome desktop, Chrome Android, and Safari iOS (with documented iOS Safari quirks).

Request files for Phase 4 will be authored after Phase 3 ships. Likely breakdown:

- 4.1 — Platform abstraction `PlatformAdapter` real implementation (web)
- 4.2 — Mic capture UI + permission UX (covering iOS Safari gesture requirement)
- 4.3 — Storage upload + path-prefix policies
- 4.4 — `score-pronunciation` Edge Function
- 4.5 — Pronunciation session UI + history view
- 4.6 — Storage retention cron job (pg_cron or scheduled Edge Function)
