# Phase 3 — Comprehension Mode (speed scoring)

Comprehension session UI: target word/phrase appears, user types or selects translation under soft time pressure (no hard timeout — speed contributes to score). Combined accuracy × speed score. Per-card response time tracked. Russian Cyrillic input handled correctly in similarity comparison.

**Exit criteria:** A user can complete a comprehension session, see speed and accuracy results per card and per session, history persists across sessions and displays in card detail view. Russian Cyrillic input handled correctly in similarity comparison.

Request files for Phase 3 will be authored after Phase 2 ships. Likely breakdown:

- 3.1 — Unicode-aware similarity helper in `@repeaty/shared` (NFC + casefold + Cyrillic-aware)
- 3.2 — Comprehension session UI (input + soft timer)
- 3.3 — Combined accuracy × speed scoring formula (driven by ADR + spec doc)
- 3.4 — `comprehension_attempts` writes + history view in card detail
- 3.5 — Stubbed AI feedback hook (returns canned text; real Claude calls land in Phase 5)
