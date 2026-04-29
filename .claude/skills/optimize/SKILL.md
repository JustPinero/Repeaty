---
name: optimize
description: Run after phase completion or on demand. Identifies performance issues, duplication, unnecessary complexity, and improvements the user may not be aware of.
---

# Optimize

## When to invoke
- End of every phase.
- On demand for an area or specific concern: `/optimize bundle`, `/optimize apps/web/src/features/flashcards`.

## Modes
- **Quick** — files touched in the target phase.
- **Deep** — entire codebase.

## Impact tiers
- **High** — major perf or quality improvement worth scheduling immediately. (Bundle bloat, N+1 queries, unbounded re-renders, missing memoization on hot path, missing index on a queried column.)
- **Medium** — notable improvement, worth a follow-up request. (Duplicated logic, shallow abstractions, suboptimal SRS query patterns.)
- **Low** — minor cleanup, nice to have. Generally ignored unless trivial.

## What to look for
1. **Bundle size** — unused imports, missing `lazy` on route splits, full-library imports where tree-shaking fails (lodash, date-fns), shadcn components imported wholesale.
2. **Render hot paths** — flashcard review loop, mic capture, comprehension timing. `useMemo`/`useCallback` only where the prop identity matters.
3. **Database** — missing indexes on `reviews(user_id, due_at)`, `cards(deck_id)`, `pronunciation_attempts(user_id, card_id, created_at)`. Any N+1 from React Query loops.
4. **PWA** — service worker cache strategy mismatched to data freshness, IndexedDB writes outside transactions, audio blob retention beyond policy.
5. **Edge Functions** — cold-start cost, payload size, AbortController timeouts in place, response caching for deterministic feedback.
6. **Duplication** — three near-identical components → pattern emerging; three near-identical functions → likely a shared helper. (Don't extract on first sight; extract on third.)
7. **Complexity** — functions > 60 lines, components > 200 lines, files > 500 lines; nesting > 3 levels.

## Output
1. Report → `audits/optimize-phase-N.md` ranked by impact, each with file:line + measured/estimated impact.
2. Fix requests for **High** items → `requests/phase-N-fixes/fix-optimize-[short-desc].md`. Medium items go in the report only; user decides if they become requests.

## Non-blocking
Optimize never blocks a phase. Findings inform scheduling, not gating.
