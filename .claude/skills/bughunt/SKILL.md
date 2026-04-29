---
name: bughunt
description: Run after phase completion or on demand. Searches for logic errors, race conditions, unhandled states, and security issues.
---

# BugHunt

## When to invoke
- End of every phase.
- On demand for an area: `/bughunt apps/web/src/features/pronunciation`.

## Modes
- **Quick** — files touched in the target phase.
- **Deep** — specified area, deeper analysis.

## Priority tiers
- **Critical** — blocks next phase. Data loss, auth bypass, RLS leak, crash, persistent corruption, secret leakage, unbounded cost (e.g. uncapped LLM calls).
- **Warning** — fix soon. Wrong behavior in non-critical paths, silent failures, regressions to UX, accessibility violations on interactive elements, missing rate limits on POST endpoints.
- **Info** — minor. Cosmetic, refactor opportunities (ship to `/optimize` instead if perf-related).

## What to look for
1. **RLS holes** — every new table/column/policy. Verify a second user cannot read row-A's data via every read path.
2. **Race conditions** — concurrent reviews, double-tap submission, audio recording overlap, optimistic UI vs server truth.
3. **Unhandled states** — loading, empty, error, offline, mic-permission-denied, network failure during Whisper upload.
4. **Cost runaways** — LLM/Whisper calls without per-user daily caps; missing AbortController timeout on external API calls; missing feedback caching.
5. **Input validation** — every POST/PATCH/PUT endpoint, every path/query param, every JSON.parse on external data wrapped in try/catch.
6. **Secret exposure** — anything `VITE_`-prefixed must never carry a server key. `console.log` of tokens or PII.
7. **Schema/code drift** — Zod schema vs DB column types, shared types in `packages/shared` vs both consumers.
8. **A11y** — non-native interactive elements without keyboard handlers; missing `htmlFor`/`aria-label`; focus traps in modals.
9. **PWA / offline** — service worker cache invalidation, stale data after re-online, IndexedDB quota errors.

## Output
1. Report → `audits/bughunt-phase-N.md` with findings grouped by priority, each with file:line citation and reproduction steps.
2. Fix requests → `requests/phase-N-fixes/fix-bug-[short-desc].md` for every Critical and Warning, with proposed fix + acceptance criteria.

## Blocking rule
**Any Critical finding blocks the next phase.** No exceptions without an explicit `/defer` entry in `audits/debt.md` and user sign-off.
