-- 0018_list_admin_profiles_rpc.sql
-- /admin route's profile-list query bypass: the table-level SELECT policy on
-- profiles is `auth.uid() = id`, so an admin querying `profiles` directly
-- still only sees their own row. This SECURITY DEFINER RPC sidesteps that
-- with an explicit caller-is-admin check, returning the rollup the admin
-- page renders.
--
-- Why an RPC instead of widening the table policy: keeps the table policy
-- tight (every authenticated read against profiles is still single-row in
-- the hot dashboard path) and makes the admin-only side trip explicit and
-- auditable.

create or replace function public.list_admin_profiles(p_limit int default 50)
returns table (
  id           uuid,
  display_name text,
  email        text,
  tier         text,
  is_admin     boolean,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_admin   boolean;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select p.is_admin into v_admin
    from public.profiles p
   where p.id = v_actor;
  if v_admin is distinct from true then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'INVALID_LIMIT: %', p_limit using errcode = '22023';
  end if;

  return query
    select p.id, p.display_name, p.email, p.tier, p.is_admin, p.created_at
      from public.profiles p
     order by p.created_at desc
     limit p_limit;
end;
$$;

revoke all on function public.list_admin_profiles(int) from public;
grant execute on function public.list_admin_profiles(int) to authenticated;
