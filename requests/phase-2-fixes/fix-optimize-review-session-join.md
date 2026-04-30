# Fix — `useReviewSession` should fetch cards + reviews in one round-trip

## What's wrong
`apps/web/src/features/review/useReviewSession.ts:50-68` makes two serial Supabase requests:
1. `from('cards').select(...).eq('deck_id', deckId).order('id')`
2. `from('reviews').select('card_id, fsrs_state').eq('user_id', userId).in('card_id', cards.map(c => c.id))`

The second request is a left-join's-worth of work that Supabase can do in one call via nested-select syntax.

## Why it matters
- **Latency:** session start drops by ~50-200ms per session on cellular.
- **Pattern reuse:** Phase 3 (comprehension) and Phase 4 (pronunciation) will need the same "cards + per-card history" join. Establishing the pattern here prevents three modes from each issuing two-request boilerplate.
- **Correctness:** the current two-request approach has a subtle ordering issue — between the cards query and the reviews query, a new review row could be inserted by another tab / device. The session would treat it as `initialState`. A single query is consistent.

## Proposed fix
```ts
const { data, error } = await supabase
  .from('cards')
  .select(`
    id, target_text, native_text, ipa,
    example_sentence_target, example_sentence_native, language_code,
    reviews!inner_or_left(fsrs_state)
  `)
  .eq('deck_id', deckId)
  .eq('reviews.user_id', userId)
  .order('id');
```

The `reviews!left(...)` syntax (or its current supabase-js equivalent) does a server-side left-join scoped to the user. Note: the join is RLS-enforced — `reviews_select_own` already requires `user_id = auth.uid()`, so the `.eq('reviews.user_id', userId)` is redundant but explicit-and-correct.

Map the result to the existing `QueueItem[]` shape:
```ts
const items: QueueItem[] = (data ?? []).map((row) => ({
  card: { /* extract card columns */ },
  state: row.reviews[0]?.fsrs_state ?? initialState(now),
}));
```

## Files to touch
- `apps/web/src/features/review/useReviewSession.ts` — replace two queries with one nested-select.
- `apps/web/src/features/review/useReviewSession.test.ts` — update mocks (one `from('cards')` chain instead of cards + reviews).
- `apps/web/tests/integration/supabase/` — optional new integration test `review-session-join.test.ts` that asserts the join returns the user's review state and not other users'.

## Acceptance criteria
- DevTools Network shows exactly one Supabase request when entering a review session (was two).
- The test for "starts with first card after fetch" passes against the new mock shape.
- A user with prior reviews on some cards gets the correct `fsrs_state` per card; new cards default to `initialState(now)`.
- A second authenticated user reading the same deck does NOT see the first user's review state in the join (RLS isolation).
