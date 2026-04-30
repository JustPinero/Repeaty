-- 0008_rls_check_helper.sql
-- Test-only helper that lets the integration suite assert RLS is enabled
-- on every public table. Without this, schema.test.ts can only assert that
-- isolation works for the seven tables it exercises directly — a future
-- table added without RLS would not be caught.
--
-- SECURITY DEFINER so it can read pg_class regardless of the caller, but
-- EXECUTE is granted only to service_role (used in tests). Authenticated
-- users cannot call it.

create or replace function public._test_relrowsecurity(p_table text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = p_table
$$;

revoke all on function public._test_relrowsecurity(text) from public;
revoke all on function public._test_relrowsecurity(text) from authenticated;
grant execute on function public._test_relrowsecurity(text) to service_role;
