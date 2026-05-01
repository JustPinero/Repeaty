-- 0019_bump_rate_limit_decrement_rpc.sql
-- Companion to `bump_rate_limit` (0015). Edge Functions call this in their
-- error path when an upstream Anthropic call fails for an *infrastructure*
-- reason (timeout, 5xx) — the user shouldn't have a quota slot burned for a
-- transient outage.
--
-- Not called for Zod-parse / model-side malformed JSON failures: those are
-- "the model gave us garbage", which the user is likely to retry, and we
-- still want each retry to tick the budget so a misbehaving prompt template
-- can't drain quota silently.
--
-- Idempotent + clamps at 0 so a double-decrement (in any future race) can't
-- push the count negative.

create or replace function public.bump_rate_limit_decrement(
  p_bucket text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count   integer;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  update public.rate_limits
     set count = greatest(count - 1, 0)
   where user_id = v_user_id
     and bucket  = p_bucket
     and day     = current_date
  returning count into v_count;

  -- If no row existed (decrement called before any bump for the day), the
  -- update is a no-op; treat as 0 for the return value.
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.bump_rate_limit_decrement(text) from public;
grant execute on function public.bump_rate_limit_decrement(text) to authenticated;
