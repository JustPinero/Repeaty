-- 0020_get_recent_weak_words_rpc.sql
-- Single round-trip lookup of "weak words" for `generate-lesson`. Unions
-- three sources, dedupes by `target_text`, returns most-recent-first up to
-- p_limit:
--
-- 1. comprehension_attempts.correct = false
-- 2. pronunciation_attempts.similarity_score < 0.6
-- 3. reviews.ease < 1.6 (FSRS proxy for "user's been rating poorly")
--
-- All three are joined to cards filtered by p_language so the language
-- filter is server-side. SECURITY INVOKER so RLS still applies — caller
-- only gets their own attempts and their own reviews. (Bundled cards are
-- visible to everyone via the deck RLS policy, so the JOIN doesn't widen
-- visibility.)

create or replace function public.get_recent_weak_words(
  p_user_id   uuid,
  p_language  text,
  p_limit     integer default 50
) returns table (target_text text, last_seen timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  with weak as (
    select c.target_text as target_text, ca.created_at as last_seen
      from public.comprehension_attempts ca
      join public.cards c on c.id = ca.card_id
     where ca.user_id = p_user_id
       and ca.correct = false
       and c.language_code = p_language

    union all

    select c.target_text, pa.created_at
      from public.pronunciation_attempts pa
      join public.cards c on c.id = pa.card_id
     where pa.user_id = p_user_id
       and pa.similarity_score < 0.6
       and c.language_code = p_language

    union all

    select c.target_text, r.updated_at
      from public.reviews r
      join public.cards c on c.id = r.card_id
     where r.user_id = p_user_id
       and r.ease < 1.6
       and c.language_code = p_language
  ),
  deduped as (
    select target_text, max(last_seen) as last_seen
      from weak
     group by target_text
  )
  select target_text, last_seen
    from deduped
   order by last_seen desc
   limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.get_recent_weak_words(uuid, text, integer) from public;
grant execute on function public.get_recent_weak_words(uuid, text, integer) to authenticated;
