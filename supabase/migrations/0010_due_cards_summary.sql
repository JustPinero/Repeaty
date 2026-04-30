-- 0010_due_cards_summary.sql
-- RPC that aggregates per-deck due/new card counts for the calling user in a
-- single round-trip. Replaces useDueCards's previous 4 chained queries.
--
-- SECURITY INVOKER + auth.uid() — RLS continues to apply for any future
-- direct table reads. The decks visibility filter is duplicated server-side
-- (source = 'bundled' OR owner_id = auth.uid()) so a future direct call (e.g.
-- via service role) doesn't accidentally leak cross-user state.
--
-- Ordering is deterministic: (due_count + new_count) DESC, then deck_name
-- ASC as the tiebreak. This also resolves the "non-deterministic top-deck
-- pick" BugHunt Warning — the client always lands on the same deck for the
-- same user state.

create or replace function public.due_cards_summary()
returns table (
  deck_id uuid,
  deck_name text,
  language_code text,
  due_count integer,
  new_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with my_reviews as (
    select card_id, due_at
      from public.reviews
     where user_id = auth.uid()
  ),
  visible_cards as (
    select
      c.id   as card_id,
      c.deck_id,
      d.name as deck_name,
      d.language_code
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
      or count(*) filter (where mr.card_id is null) > 0
   order by
     count(*) filter (where mr.due_at is not null and mr.due_at <= now())::int
     + count(*) filter (where mr.card_id is null)::int desc,
     max(vc.deck_name) asc;
$$;

revoke all on function public.due_cards_summary() from public;
grant execute on function public.due_cards_summary() to authenticated;
