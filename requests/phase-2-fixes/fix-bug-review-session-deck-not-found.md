# Fix — Deck-not-found is presented as "Nothing due"

## What's wrong
`apps/web/src/features/review/useReviewSession.ts:50-77` — when a user navigates to `/app/decks/<bad-uuid>/review` (typo, stale link, deck soft-deleted, or a deck not visible under RLS), the cards query at line 51 returns `[]` (RLS denies). The hook hydrates with `items=[]`, `total=0`, `queue.length===0` after the effect — and `isComplete` becomes `true` immediately.

`ReviewSessionPage.tsx:43-54` then takes the `progress.total === 0` branch and renders:

> Nothing due — try again later.

This is the wrong error class. The deck doesn't exist (or isn't visible to this user), but the UX implies the user has an empty review queue for that deck — which they should hit "later" to refresh. There is no signal that the URL is wrong.

## Why it matters
- Users hitting a stale link from chat / shared dashboard sit waiting "for cards to come due" on a deck that won't ever have any.
- When deletion-with-soft-delete lands as a feature (Phase 5+), this masks the error class.
- Telemetry will show high "empty session" rates that mix legitimate empty queues with deck-not-found, hurting analytics.

## Proposed fix
Either (a) fetch the deck row before the cards query and surface a 404 if missing, or (b) decide on a stricter empty-state rule that distinguishes "0 cards in deck" from "no due cards in deck".

Option (a) — preferred:
```ts
queryFn: async () => {
  const deckRes = await supabase
    .from('decks')
    .select('id, name, language_code')
    .eq('id', deckId)
    .is('deleted_at', null)
    .maybeSingle();
  if (deckRes.error) throw new Error(deckRes.error.message);
  if (!deckRes.data) throw new Error('DECK_NOT_FOUND');
  // ... existing cards + reviews queries
}
```

`ReviewSessionPage.tsx` then checks `error?.message === 'DECK_NOT_FOUND'` (or use a typed error class) and renders:
> This deck doesn't exist or isn't available to you.
> [Back to your decks]

## Files to touch
- `apps/web/src/features/review/useReviewSession.ts`
- `apps/web/src/features/review/ReviewSessionPage.tsx`
- `apps/web/src/features/review/ReviewSessionPage.test.tsx` — add "renders not-found alert when the deck doesn't exist"
- `apps/web/src/features/review/useReviewSession.test.ts` — add a test that mocks the deck query to return `null` and asserts `isError` + a recognizable error.

## Acceptance criteria
- Navigating to `/app/decks/<bad-uuid>/review` shows a "deck not found" alert with a back link, NOT the "Nothing due" empty state.
- An empty deck (deck exists, has 0 cards) still shows "Nothing due" (the current branch), distinct from the not-found branch.
- An authenticated user navigating to another user's owned deck (RLS-invisible) gets the same not-found UX (RLS denies the deck SELECT before the cards SELECT runs).
