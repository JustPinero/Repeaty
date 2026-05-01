# Fix — Pronunciation offline path fails opaquely

**Severity:** Medium (bughunt-phase-6 Med-3)
**Originating audit:** Phase 6 bughunt
**Discovered:** 2026-04-30

## Root cause

`apps/web/src/features/pronunciation/usePronunciationSession.ts:107-145` (`submitRecording`) calls `uploadPronunciationBlob` → `supabase.functions.invoke('score-pronunciation')`. Neither has a `navigator.onLine === false` short-circuit. Offline:

- `uploadPronunciationBlob` → supabase-js → `fetch` → `TypeError: Failed to fetch` → the function throws.
- `MicCapture` (the consumer) treats this as a generic recording-error and surfaces something like "score-pronunciation returned no data" or "Failed to fetch."

The full enqueue + replay path is correctly deferred to DEBT-008. But the user-visible message is wrong: it implies a server problem rather than a network problem, and offers no actionable next step.

## Acceptance criteria

- [ ] At the top of `submitRecording`, check `navigator.onLine === false` and throw a typed error (e.g. `new Error('OFFLINE_PRONUNCIATION_UNSUPPORTED')`) with a message Ben can act on: "Pronunciation practice needs a connection. Reconnect and try again."
- [ ] `MicCapture` (or whichever component handles the error) detects this error code and renders the message instead of the generic recording-error UX.
- [ ] One unit test: with `navigator.onLine = false`, calling `submitRecording(blob)` throws the typed error and does NOT attempt the upload.

## Files to touch

- `apps/web/src/features/pronunciation/usePronunciationSession.ts`
- `apps/web/src/features/pronunciation/usePronunciationSession.test.ts`
- The MicCapture / PronunciationSessionPage error-display surface.
