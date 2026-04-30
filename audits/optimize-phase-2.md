# Optimize — Phase 2 (Flashcards & SRS)

Mode: quick. Scope: files modified between `main` and `phase-2-flashcards` HEAD.

## Summary
- **High:** 2
- **Medium:** 4
- **Low:** 3

The phase ships clean on bundle hygiene (shadcn primitives are file-per-component in `apps/web/src/components/ui/`, so consumers tree-shake correctly; `lucide-react` icons are imported via per-icon paths or not at all here). The FSRS scheduler wraps `ts-fsrs` with a thin `fromCard`/`toCard` translation layer that's fine at single-card-per-rating volume; for the future Phase-6 batch-replay path it'll need vectorization. The two High-impact items are: (1) `useDueCards` issues 4 round-trips to Supabase per dashboard load, when the same data fits in a single RPC or an inner-join via supabase-js, and (2) `useReviewSession` re-fetches every card in the deck regardless of which are actually due — at 30 cards per bundled deck this is fine, but at Phase-5's AI-generated 100-card decks it'll feel laggy on slow connections.

## High

### H-1 — `useDueCards` makes 4 round-trips per dashboard load
**File:** `apps/web/src/features/dashboard/useDueCards.ts:39-122`

The hook serially issues:
1. `from('decks').select(...)` — list visible decks
2. `from('cards').select(...).in('deck_id', ...)` — list cards under those decks
3. `from('reviews').select(...).eq(user, due_at)` — due reviews
4. `from('reviews').select(...).eq(user)` — all reviews (to derive "new" cards)

Each call is a network round-trip (~50-200ms each on cellular). Total ~200-800ms latency on the dashboard's primary CTA. The same aggregation can be a single Supabase RPC that returns `{ deck_id, due_count, new_count, deck_name, language_code }` — one round-trip, all aggregation server-side, no client-side Map population:

```sql
create or replace function public.due_cards_summary()
returns table (
  deck_id uuid, deck_name text, language_code text,
  due_count integer, new_count integer
) ...
```

Alternatively, supabase-js's nested-select can collapse calls 1+2:
```ts
.from('decks').select('id, name, language_code, cards(id)').is('deleted_at', null)
```

Combined with calls 3+4 fused into a single `from('reviews').select('card_id, due_at').eq('user_id', userId)` (compute the due/all split client-side), the dashboard goes from 4 round-trips to 2.

**Estimated impact:** dashboard time-to-interactive on cellular drops by 100-400ms.

### H-2 — `useReviewSession` fetches every card in the deck up-front, ignoring "due" semantics
**File:** `apps/web/src/features/review/useReviewSession.ts:50-77`

The hook fetches all cards in the deck (no `.limit()`, no due-filter), then joins with the user's reviews client-side. For bundled decks (30 cards) this is a few KB. For the Phase-5 AI-generated decks the request says will be 5–25 cards by default, so this is fine for v1 budget — but the comment in the request file ("`useReviewSession(deckId)` … fetches the deck's cards … joined with the user's reviews rows") implies a left-join, and the current implementation does it as two queries instead.

Two improvements:
1. **Supabase nested select** — use `from('cards').select('*, reviews!left(fsrs_state)').eq('deck_id', deckId).eq('reviews.user_id', userId)` for one round-trip instead of two.
2. **Server-side ordering** — append `.order('id')` already present, but for very large decks (Phase 5+) consider a `where reviews.due_at <= now() OR reviews.due_at is null`-equivalent server-side filter so the queue arrives pre-ordered with the "due" subset on top.

**Estimated impact:** review session start latency drops from 2 round-trips to 1; saves ~50-200ms per session start on cellular.

## Medium

### M-1 — `useReviewSession` re-renders the entire `Flashcard` on every progress update
**File:** `apps/web/src/features/review/ReviewSessionPage.tsx:74-96`

The page reads `session.progress.reviewed`, `session.progress.remaining`, and `session.currentCard`. On every `submitRating`, all of these update at once and the `<Flashcard>` re-mounts. The reset effect `useEffect(() => { setRevealed(false); }, [targetText])` works because `targetText` actually changes — but the entire card subtree re-renders even when the same card is re-displayed (e.g. `Again` re-enqueue cycle).

A small `React.memo` wrap on `Flashcard` (cheap, inputs are primitives) skips the re-render when the card's props are unchanged.

### M-2 — `seed-decks.ts` builds the SQL string by `lines.push` + `lines.join('\n')` for every card
**File:** `scripts/seed/seed-decks.ts:111-153`

Fine at 60 cards. At 1000+ (future user-imported decks per DEBT or Phase-6 multi-language), the per-card 8-line block × 1000 = 8000 push calls, all in a single in-memory array, then one `join` of an 8000-element array. Acceptable. But the per-card SQL is ~10 lines × 200 chars ≈ 2KB per card; at 1000 cards that's 2MB of in-memory string-building. Consider streaming write to disk for the large case — but only when it actually matters.

Low priority; flagged for the Phase-5/6 horizon.

### M-3 — `Flashcard.tsx` always calls `platform.canSpeak()` on render
**File:** `apps/web/src/features/decks/Flashcard.tsx:23`

`const showPlay = !!languageCode && platform.canSpeak();` runs on every render. `canSpeak()` does two lookups against `window` — cheap, but constant. If the platform adapter ever moves to an async / network-aware capability check (e.g. "voices are loaded yet?"), this becomes a hot-path call. Cache via `useMemo(() => platform.canSpeak(), [])` once we know the answer is stable per session.

### M-4 — `useReviewSession.queryFn` builds a full `Map` of `reviewsByCard` even when `reviews` returns 0 rows
**File:** `apps/web/src/features/review/useReviewSession.ts:65-68`

For new users with 0 prior reviews, the loop is fine (0 iterations). But the `cards.map((c) => c.id)` round trip in line 63 sends every card id even when no reviews exist. Acceptable at 30 cards. Worth noting: a fast-path skip on `cards.length === 0` would avoid the second supabase call entirely (the page renders the empty state from the first cards-result already).

## Low

### L-1 — `Button.tsx` re-evaluates `cn(buttonVariants(...))` on every render
Standard shadcn pattern. Tailwind's runtime cost is zero; cva is amortized. Don't optimize.

### L-2 — `ReviewSessionPage` recreates `handleRate` on every render
The function captures `submitting` and `session.submitRating`. `useCallback` would prevent re-creation, but `<RatingButtons>` is not memoized so the saving is zero. Skip.

### L-3 — `Flashcard.tsx` resets `revealed` via `useEffect` rather than deriving from `targetText`
`useEffect(() => { setRevealed(false); }, [targetText])` causes a render-reset-render dance on each card change. A `key={targetText}` on `<Flashcard>` from the parent (or a render-time check `if (revealed && ...) ` reset) would skip one render. Saves ~1ms per card change. Not worth it.

## Bundle / cost notes

- `ts-fsrs@4.7.1` — declared `^4.5.0` in `packages/shared/package.json`, resolves to 4.7.1 per lockfile. ~30KB gz when the review session lazy loads it. Not a leak.
- `class-variance-authority`, `clsx`, `tailwind-merge` — all in `apps/web/dependencies` and used by shadcn primitives. ~5KB gz combined. Documented in `apps/web/package.json` but **not** in `references/architecture.md`'s dep log (DriftAudit picks this up).
- `lucide-react@^0.469.0` is in dependencies but I see no imports in the modified files. Verify with `grep -r "from 'lucide-react'" apps/web/src` — if zero imports, drop the dep.
- `tailwindcss-animate` in devDependencies; used by the `animate-flip-in` class on `Flashcard.tsx:69`. Actively in use.

## Top three improvements (ranked by impact)

1. **Collapse `useDueCards`'s 4 round-trips to 1-2** via a Supabase RPC or nested select. Dashboard loads on cellular drop by 100-400ms — a measurable UX win for the primary CTA.
2. **Use a left-join in `useReviewSession`** to fetch cards + their reviews in one round-trip. Smaller win (50-200ms per session start), but the same pattern applies to all future "card + review state" queries (comprehension/pronunciation modes will repeat this).
3. **Memoize `Flashcard`** to skip re-renders on `Again` re-enqueue cycles. Tiny but free.

## Fix-request files generated (High items only)

- `requests/phase-2-fixes/fix-optimize-due-cards-rpc.md` (H-1)
- `requests/phase-2-fixes/fix-optimize-review-session-join.md` (H-2)

Medium and Low items live in this report only — user decides if they become requests.
