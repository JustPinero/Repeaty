# Fix — Collapse `useDueCards`'s 4 round-trips into a single Supabase RPC

## What's wrong
`apps/web/src/features/dashboard/useDueCards.ts:39-122` makes four serial Supabase round-trips per dashboard load:
1. `from('decks').select('id, name, language_code').is('deleted_at', null)`
2. `from('cards').select('id, deck_id').in('deck_id', [...])`
3. `from('reviews').select('card_id').eq('user_id', userId).lte('due_at', nowIso)`
4. `from('reviews').select('card_id').eq('user_id', userId)`

Each call is a separate HTTP request. On cellular, total latency is ~200-800ms before the dashboard's primary CTA renders.

## Why it matters
The dashboard's "Start review — X" CTA is the single most-trafficked surface in the app once a user is past onboarding. Phase 2 effectively makes this the primary entry point. Reducing latency by 100-400ms on cellular is a clear UX win, and the data is small + denormalizable, so it fits one round-trip.

## Proposed fix
Add a Supabase RPC `due_cards_summary()` that runs all the aggregation server-side:

```sql
-- migration NNNN_due_cards_summary.sql
create or replace function public.due_cards_summary()
returns table (
  deck_id uuid,
  deck_name text,
  language_code text,
  due_count integer,
  new_count integer
)
language sql stable security invoker
set search_path = public
as $$
  with my_reviews as (
    select card_id, due_at
      from public.reviews
     where user_id = auth.uid()
  ),
  visible_cards as (
    select c.id as card_id, c.deck_id, d.name as deck_name, d.language_code
      from public.cards c
      join public.decks d on d.id = c.deck_id
     where d.deleted_at is null
       and (d.source = 'bundled' or d.owner_id = auth.uid())
  )
  select
    vc.deck_id,
    max(vc.deck_name) as deck_name,
    max(vc.language_code) as language_code,
    count(*) filter (where mr.due_at is not null and mr.due_at <= now())::int as due_count,
    count(*) filter (where mr.card_id is null)::int as new_count
  from visible_cards vc
  left join my_reviews mr on mr.card_id = vc.card_id
  group by vc.deck_id
  having count(*) filter (where mr.due_at is not null and mr.due_at <= now()) > 0
      or count(*) filter (where mr.card_id is null) > 0;
$$;

grant execute on function public.due_cards_summary() to authenticated;
```

`useDueCards.ts` becomes:
```ts
const { data, error } = await supabase.rpc('due_cards_summary');
// data: [{ deck_id, deck_name, language_code, due_count, new_count }, ...]
// pick top deck by (due_count + new_count, deck_name) tiebreak
```

The fix-bug-due-cards-deterministic-top-deck request's tiebreak still applies — server-side sort by `(due+new) desc, deck_name asc` is the cleanest place for it.

## Files to touch
New:
- `supabase/migrations/NNNN_due_cards_summary.sql` (next available number)
- `apps/web/tests/integration/supabase/due-cards-summary.test.ts` — RPC contract test (RLS-respecting, returns expected shape, omits empty decks)

Updated:
- `apps/web/src/features/dashboard/useDueCards.ts` — replace queryFn body with single `supabase.rpc(...)` call
- `apps/web/src/features/dashboard/useDueCards.test.ts` — switch from `from('reviews')` chain mocks to a single `supabase.rpc('due_cards_summary')` mock
- `references/schema.md` — document the new RPC under "RPCs"
- `references/architecture.md` — log no new dep (RPC is SQL-only)

## Acceptance criteria
- The dashboard issues exactly one Supabase HTTP request to populate the review queue (verifiable in DevTools Network tab).
- An RLS test asserts that User B's `due_cards_summary()` does not include User A's reviews.
- Existing unit tests (after mock swap) continue to pass.
- The performance budget for `Time to CTA on dashboard` drops by at least 100ms on a throttled "Slow 3G" Lighthouse run.
