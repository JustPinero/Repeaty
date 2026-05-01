# Manual testing handoff — v1 beta + post-launch maintenance

What to poke at in a real browser / on iOS, ranked by "would meaningfully degrade Ben's first 30 minutes" if it broke.

## Setup (5 min)

```bash
git checkout main && git pull
bash scripts/dev-up.sh --reset             # toolchain check + install + supabase + db reset + dev server
# → Repeaty at http://localhost:5173
# → Studio at http://localhost:54323
# → Inbucket (signup confirm emails) at http://localhost:54324
```

For Pro-tier features (admin, generate-lesson, generate-feedback, tts-jazh):
```bash
# 1. Drop API keys into supabase/.env
echo "OPENAI_API_KEY=sk-..." > supabase/.env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> supabase/.env
echo "SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | awk -F= '/^SERVICE_ROLE_KEY=/{print $2}' | tr -d '\"')" >> supabase/.env

# 2. Re-run dev-up with --with-functions
bash scripts/dev-up.sh --with-functions    # background-starts `supabase functions serve`
```

Other flags: `--no-dev` (skip Vite if you want it in another terminal), `--help`.

## Critical-path smoke (free tier — 10 min)

**Goal:** every Phase-1-through-4 flow works end-to-end with a brand-new account.

1. **Signup → onboarding → dashboard.** Sign up with a fresh email at `/signup`. Onboarding wizard should ask for display_name → native language → at least one target language + CEFR. Land on `/app` with the Peaty greeting.
2. **Review session.** Click "Start review" on the bundled `es` Starter deck. Reveal each card → rate Good for 3-5 cards. Progress counter advances. Hitting "Again" should put the card back in the queue.
3. **TTS Play button.** On a Spanish card, click 🔊. Should hear browser SpeechSynthesis. _Test this in both Chrome and Safari iOS — Safari has voice-list quirks._
4. **Comprehension session.** From `/app/decks`, click "Comprehension" on the same deck. Type the answer for 3-5 cards. Score panel shows after each (perfect / close / miss with the canned-text feedback panel).
5. **Pronunciation session.** From `/app/decks`, click "Pronunciation". Click 🎤 Record (browser asks for mic permission — allow). Speak the target. Click ⏹️ Stop. Should see Whisper transcript + similarity score.
6. **Per-card history.** From CardDetail (e.g. `/app/decks/<id>/cards/<id>`), confirm both Comprehension history and Pronunciation history panels render with the attempts you just made. Click ▶︎ on a pronunciation row → audio plays back.

## Pro-tier surface (need a Pro-flipped account — 10 min)

Get a Pro account:
1. Sign up a second account.
2. Sign in as a service-role-flagged admin (manually flip `is_admin = true` on yourself in the Supabase dashboard for the first account).
3. Visit `/app/admin` from the admin account. Cycle the second account → pro.
4. Sign in as the second account.

Then:

7. **Generate a lesson.** "Generate a lesson" pill on the dashboard → fill the form (target language, optional topic hint, card count slider). Submit. Should land on `/app/decks/<new>/review` with an AI-generated deck. _The Anthropic call costs ~$0.005 per lesson._
8. **AI feedback.** Run a comprehension session and miss a card on purpose ("hello" → "helo"). The FeedbackPanel should show the AI-generated coaching string instead of the canned-text fallback. Same in pronunciation.
9. **JA/ZH TTS (DEBT-003 active).** Add Japanese to your user_languages (re-onboard, or insert directly). Run a review on the bundled ja Starter deck. Click 🔊 — should hear OpenAI TTS (cleaner than browser). Repeat the same card → cache hits, no second OpenAI call. Verify in DevTools Network tab.

## PWA / offline (10 min)

10. **PWA install.**
    - **Chrome desktop:** address bar shows an install icon. Click → app installs as a window.
    - **iOS Safari:** Share → Add to Home Screen. Open from home screen → standalone mode (no browser chrome). The dashboard should NOT show the InstallHint pill once installed (it self-hides via `navigator.standalone`).
    - **Lighthouse:** run against `http://localhost:5173` after `pnpm --filter @repeaty/web build && pnpm --filter @repeaty/web preview`. PWA score should be high; the icon-installability check passes (192/512/maskable PNGs are real now).
11. **Offline review.** Devtools → Network → Offline. Rate a flashcard. Toggle back online. The `useOfflineReplay` hook should drain the queue within seconds. Confirm by checking IndexedDB (Application tab → Dexie → `repeaty-offline.pending_reviews`) — empty after replay.
12. **Offline comprehension.** Same as above with a comprehension answer.
13. **Offline pronunciation (DEBT-008 active).** Record while offline. The page should show "Saved offline. Your score will land when you're back online." Reconnect. The Dexie `pending_pronunciation_attempts` table holds the audio Blob; on reconnect, it re-uploads + re-invokes score-pronunciation. The `pronunciation_attempts` row should appear server-side and show up in the per-card history panel within ~10s.

## Edge cases worth poking

- **Audio retention** (DEBT-005 active). The `audio-retention` Edge Function is service-role-only and not yet scheduled in the Supabase Dashboard. Manual test: invoke it via curl with the service-role key. Should return `{ data: { removed_count: N, error_count: 0 } }`. The schedule needs to be configured in your Supabase project (Database → Cron, daily 03:30 UTC) before it runs in prod.
- **Bundle size.** `pnpm --filter @repeaty/web build && pnpm build:size`. Should print the gz total + "✓ within budget".
- **Per-language CEFR.** If you study es@A1 and fr@B2, generate-feedback for a French card should use B2-tone coaching, not A1. Test by missing one fr card.
- **Rate-limited generate-feedback.** Burn 25+ generate-feedback calls in a UTC day from a Pro account. The 26th should fall back to canned text (the hook's `RATE_LIMITED → cannedFallback` branch). _Don't accidentally do this with a real Anthropic key — the bill is tiny but it's real money._

## Known gaps that should NOT regress

- **DEBT-006: pronunciation-session E2E flake.** The CI E2E spec is intentionally `in-progress` in `e2e-manifest.json`. Manual flow above is what's authoritative. Don't be alarmed by the spec being skipped in CI.
- **DEBT-007: 9 mascot poses still missing.** Phase-2-through-5 components currently fall back to the welcome-pose JPG anywhere they'd want a specific pose. Generate the others externally, drop into `apps/web/public/peaty/`, then update the components.
- **OfflineBanner UI not delivered.** The agent ran out of usage budget mid-task. Queue depth is observable via Devtools → IndexedDB; the in-app banner is a future polish.
- **Pronunciation offline-message render-test gap.** The hook side is unit-tested; the page rendering of "Saved offline. Your score will land when you're back online." isn't asserted. Manual testing covers it (step 13 above).

## Open debt remaining (4)

| ID | Title | Activation gate |
| --- | --- | --- |
| 001 | Stripe billing | When v1 outgrows manual `/admin` flips |
| 002 | Native via Capacitor | Apple Developer + Google Play accounts |
| 004 | Phoneme-level pronunciation | Real users hit the Levenshtein limit |
| 006 | Pronunciation E2E flake | CI trace artifact + dashboard "your decks" link |
| 007 | Remaining 9 mascot poses | Image-gen tooling outside repo |

DEBTs 003, 005, 008 closed in the post-launch maintenance pass.

## Reporting back

If something's broken, the fix shape is usually one of:
- **Test gap** → drop a failing test under `apps/web/src/...test.{ts,tsx}` describing the broken behavior; commit RED.
- **Hook bug** → fix in the corresponding `useXSession.ts` + add a regression test.
- **Edge Function bug** → handler-factory pattern means the fix is in `handler.ts`; add a Deno test under `handler.test.ts`.
- **Doc drift** → patch the `references/*.md` file directly; no code change.

The next-conversation handoff at `.claude/handoff.md` is empty / stale by the time you'd be reading this. Re-run the action loop in `CLAUDE.md` for any non-trivial change.
