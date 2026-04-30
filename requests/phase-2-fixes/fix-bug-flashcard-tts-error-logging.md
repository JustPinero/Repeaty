# Fix — `Flashcard.handlePlay` swallows speech errors with no logging

## What's wrong
`apps/web/src/features/decks/Flashcard.tsx:37-48` catches every error from `platform.playTargetText` with an empty block:

```ts
try {
  await platform.playTargetText(targetText, { lang: languageCode });
} catch {
  // Best-effort — don't surface speech errors to the user; the answer
  // is still readable.
}
```

The "best effort" sentiment is reasonable for the user-facing UX (don't pop a modal on every JA/ZH degraded voice), but the implementation also discards every diagnostic. `webPlatform.playTargetText` rejects with structured messages like `Speech failed: language-unavailable`, `Speech failed: synthesis-failed`, etc. (see `apps/web/src/platform/web.ts:30-33`). None of that surfaces.

This collides with three real failure classes:
1. **DEBT-003 (JA/ZH degraded TTS).** Browser SpeechSynthesis is acceptable for ES/FR/DE/IT/RU and "tolerable" for ja/zh per ADR-004. When it actually fails for ja/zh, the user sees a "Play" button that does nothing — no audio, no error. They tap repeatedly. Beta feedback will be "TTS is broken" with no diagnostic trail.
2. **iOS Safari user-gesture rule.** `playTargetText` outside a tap handler silently fails; future autoplay-on-reveal feature would hit this.
3. **Real bugs.** Wrong BCP-47 codes, missing voices, browser bugs — all silently absorbed.

## Why it matters
- The bug exists in user-facing behavior **today** for any beta user trying a deck whose `language_code` doesn't match an installed voice.
- Phase-6 telemetry / Sentry wiring will have nothing to analyze for "TTS quality" — the events are gone before any logger has a chance to see them.
- The Phase-2 acceptance criteria included "target audio plays correctly in Spanish and French" — when it doesn't, there's no observable signal.

## Proposed fix
```ts
async function handlePlay() {
  if (!languageCode || speaking) return;
  setSpeaking(true);
  try {
    await platform.playTargetText(targetText, { lang: languageCode });
  } catch (err) {
    // Best-effort UX: don't surface to the user, the answer is readable.
    // But DO log so beta users' bug reports have a diagnostic trail.
    // eslint-disable-next-line no-console
    console.error('TTS playback failed', { lang: languageCode, error: err });
  } finally {
    setSpeaking(false);
  }
}
```

Optional follow-up (not required for this fix): a transient toast / inline status pill ("Audio unavailable for ja"), gated on a feature flag so silence stays the default for the quiet-failure use cases.

## Files to touch
- `apps/web/src/features/decks/Flashcard.tsx` — change the empty `catch` to log.
- `apps/web/src/features/decks/Flashcard.test.tsx` — add a test that mocks `platform.playTargetText` to reject and asserts `console.error` was called (using `vi.spyOn(console, 'error')`).

## Acceptance criteria
- A failing `playTargetText` produces a `console.error` with the lang and error details.
- The user-facing UX still doesn't show an alert / dialog / toast — silence is preserved.
- The new test fails if the `catch` block is restored to empty.
