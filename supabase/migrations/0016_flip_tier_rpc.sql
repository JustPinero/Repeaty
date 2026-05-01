-- 0016_flip_tier_rpc.sql
-- Atomic tier-flip RPC for the /admin route. Caller must be `auth.uid()` and
-- have `profiles.is_admin = true`. Cannot self-flip (no self-promotion). Updates
-- `profiles.tier` AND inserts a `tier_change_log` row in a single transaction.
--
-- Returns the inserted tier_change_log id so the Edge Function can echo it
-- back for audit trail correlation.

create or replace function public.flip_tier(
  p_target_id  uuid,
  p_new_tier   text,
  p_reason     text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_is_admin   boolean;
  v_from_tier  text;
  v_log_id     uuid;
begin
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if v_actor_id = p_target_id then
    raise exception 'SELF_FLIP_FORBIDDEN' using errcode = '42501';
  end if;
  if p_new_tier not in ('free', 'pro', 'admin') then
    raise exception 'INVALID_TIER: %', p_new_tier using errcode = '22023';
  end if;

  select is_admin into v_is_admin
    from public.profiles
   where id = v_actor_id;
  if v_is_admin is distinct from true then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select tier into v_from_tier
    from public.profiles
   where id = p_target_id;
  if v_from_tier is null then
    raise exception 'TARGET_NOT_FOUND' using errcode = '02000';
  end if;
  if v_from_tier = p_new_tier then
    raise exception 'NO_CHANGE: target already on tier %', p_new_tier
      using errcode = '22023';
  end if;

  update public.profiles
     set tier = p_new_tier,
         updated_at = now()
   where id = p_target_id;

  insert into public.tier_change_log (actor_id, target_id, from_tier, to_tier, reason)
       values (v_actor_id, p_target_id, v_from_tier, p_new_tier, p_reason)
    returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.flip_tier(uuid, text, text) from public;
grant execute on function public.flip_tier(uuid, text, text) to authenticated;
