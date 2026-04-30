# Fix — Make `useDueCards` top-deck pick deterministic

## What's wrong
`apps/web/src/features/dashboard/useDueCards.ts:96-113` iterates `perDeck.entries()` in insertion order. The Map is populated by iterating the cards array (line 85), and the cards query at line 56 has no `ORDER BY` — so the per-deck arrival order is unspecified by Postgres. The tiebreak comparison at line 100 is `score > topScore` (strict), so the *first* deck inserted wins all ties, and ties happen on day-zero for a brand-new user (ES = 1 due + 2 new vs FR = 0 due + 2 new is not a tie, but ES vs FR being equal-card-count starter decks regularly is). Even non-tie cases can flip if Postgres returns rows in a different order between two requests.

The Phase 2 E2E spec had to relax its CTA assertion to `/start review/i` (any) because of this. The dashboard's primary CTA should not flip across reloads for the same user state.

## Why it matters
- **UX:** a user signing up sees "Start review — Spanish" on first visit and "Start review — French" on the second with no behavioral change. Trust degradation.
- **Test brittleness:** any test that wants to assert which deck is featured has to scope the assertion to "any bundled deck", losing precision.
- **Future bugs:** when AI-generated decks land in Phase 5, the same nondeterminism will pick between user-specific decks unpredictably.

## Proposed fix
Two small changes in `useDueCards.ts`:

1. Sort the deck-ids before the cards query so the cards-per-deck arrival groups are stable:
   ```ts
   const deckIds = decks.map((d) => d.id).sort();
   const cardsRes = await supabase
     .from('cards')
     .select('id, deck_id')
     .in('deck_id', deckIds)
     .order('deck_id', { ascending: true })
     .order('id', { ascending: true });
   ```
2. Apply a deterministic tiebreak in the top-deck selection. Sort the entries by `(-score, deck.name ASC)` before picking:
   ```ts
   const sortedEntries = [...perDeck.entries()].sort((a, b) => {
     const scoreA = a[1].dueCount + a[1].newCount;
     const scoreB = b[1].dueCount + b[1].newCount;
     if (scoreA !== scoreB) return scoreB - scoreA; // higher score first
     const nameA = deckById.get(a[0])?.name ?? '';
     const nameB = deckById.get(b[0])?.name ?? '';
     return nameA.localeCompare(nameB);
   });
   const winner = sortedEntries[0];
   ```

## Files to touch
- `apps/web/src/features/dashboard/useDueCards.ts`
- `apps/web/src/features/dashboard/useDueCards.test.ts` — add a test that asserts: given two decks with identical (due, new) counts and names "B-deck" vs "A-deck", `topDeck.deckName === 'A-deck'`.
- (Optional) `apps/web/tests/e2e/flashcard-review-session.spec.ts` — once deterministic, can re-tighten assertion to a specific deck name.

## Acceptance criteria
- The unit test for tiebreaks asserts a specific `topDeck.deckId` regardless of insertion order.
- Two reloads with identical user state produce the same dashboard CTA.
- Mutating `useDueCards.ts` to remove the `ORDER BY` still passes the unit test (because the `localeCompare` tiebreak is independent), but a manual probe shows server-side ordering is also stable.
