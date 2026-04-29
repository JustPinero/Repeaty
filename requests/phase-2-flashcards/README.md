# Phase 2 — Flashcards & SRS Engine

Bundled starter decks for Spanish and French (others come in Phase 6). Card / Deck UI components. FSRS algorithm in `packages/shared/src/fsrs.ts`. Review session flow with rating buttons (Again/Hard/Good/Easy). Browser SpeechSynthesis playback. Per-session stats.

**Exit criteria:** A user can complete a flashcard review session on a bundled deck. Cards reschedule based on FSRS responses, target audio plays correctly in Spanish and French, completed session updates persist and display in dashboard stats.

Request files in this folder will be authored at the start of Phase 2 (after Phase 1's `/phase-complete` lands a clean merge to `main`). Likely breakdown:

- 2.1 — Bundled deck content + import pipeline
- 2.2 — FSRS algorithm in `@repeaty/shared`
- 2.3 — Card / Deck UI components (shadcn-based)
- 2.4 — Review session flow + rating buttons
- 2.5 — TTS playback through the platform abstraction
- 2.6 — Per-session stats + dashboard wiring
