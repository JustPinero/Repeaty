# Fix — `getRecentWeakWords` covers only `comprehension_attempts` and post-filters language client-side

**Severity:** Medium. Bughunt Phase-5 Medium-1 + Optimize Phase-5 Medium-2.

## Root cause

`supabase/functions/generate-lesson/index.ts:64-87` queries only `comprehension_attempts`, then filters `cards.language_code` in JavaScript after pulling `limit * 2 = 100` rows. Two issues:

1. **Coverage:** the api-contracts.md spec and Request 5.5 both say weak words come from `reviews + pronunciation_attempts + comprehension_attempts`. Pronunciation `similarity_score < 0.6` and FSRS-rated `Again` cards are missed entirely.
2. **Efficiency:** language is post-filtered in JS. For a user whose comprehension history skews to a different language, the function may pull 100 rows and return zero weak words, while their target-language history sits unread.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | `getRecentWeakWords` returns target_text values from any of the three sources, deduped, most-recent-first, capped at the `limit` arg. |
| 2 | Language filtering is applied in SQL (server-side), not in JS. |
| 3 | Pronunciation rows are included when `similarity_score < 0.6`. |
| 4 | Reviews rated `Rating.Again` (`fsrs_state.rating = 1` or via the rating-event log if one exists) are included. |
| 5 | A unit test at the impl boundary asserts behavior for a synthetic mix of all three sources. |
| 6 | An integration test against a live Supabase asserts the cross-source union returns expected target_texts for a seeded user. |

## Suggested patch

Either:

**Option A — three queries unioned in JS:** parallel `Promise.all` with `cards!inner(target_text)` filtering on the join's `language_code`. Dedup + sort by created_at in JS. Acceptable for v1; ~3 round trips.

**Option B — a SQL view or RPC `get_recent_weak_words(p_user_id, p_language, p_limit)`:** single round trip, server-side dedup. Cleaner; matches the `complete_onboarding` RPC pattern.

Recommend B if the function is called frequently (Pro user generating multiple lessons per day) — the saving compounds.

## Files to touch

- `supabase/migrations/0020_get_recent_weak_words_rpc.sql` (NEW — option B)
- `supabase/functions/generate-lesson/index.ts` — swap the impl.
- `supabase/functions/generate-lesson/handler.test.ts` — extend the dep mock for the union-shape result.
- `apps/web/tests/integration/supabase/get-recent-weak-words-rpc.test.ts` (NEW — option B)
- `references/schema.md` § RPCs — document.
- `references/api-contracts.md` — clarify which sources contribute.

## Out of scope

Weighting weak words by recency / failure-count — Phase 6 polish.
