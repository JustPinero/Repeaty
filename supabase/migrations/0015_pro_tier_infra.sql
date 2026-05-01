-- 0015_pro_tier_infra.sql
-- Phase-5 groundwork: rate_limits (per-user daily counters used by
-- generate-feedback + generate-lesson Edge Functions), feedback_cache
-- (cross-user cache so identical mistake patterns don't burn redundant
-- Claude calls), tier_change_log (audit trail for /admin tier flips), and
-- the `bump_rate_limit(bucket, cap)` RPC that the Edge Functions call
-- atomically before invoking Claude.
--
-- All three tables enable RLS. rate_limits + feedback_cache + tier_change_log
-- are all "writes via service-role only" — the only sanctioned write paths
-- are the bump_rate_limit RPC (rate_limits), the Edge Function service-role
-- clients (feedback_cache), and flip-tier (tier_change_log, lands in 5.2).

-- ── rate_limits ─────────────────────────────────────────────────────────────
create table public.rate_limits (
  user_id     uuid not null references auth.users(id) on delete cascade,
  bucket      text not null,
  day         date not null default current_date,
  count       integer not null default 0,
  primary key (user_id, bucket, day)
);

alter table public.rate_limits enable row level security;

create policy "rate_limits_select_own"
on public.rate_limits
for select
to authenticated
using (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies → authenticated callers can't write
-- directly. The bump_rate_limit RPC (SECURITY DEFINER) is the only path.

-- ── feedback_cache ─────────────────────────────────────────────────────────
create table public.feedback_cache (
  id                    uuid primary key default gen_random_uuid(),
  card_id               uuid not null references public.cards(id) on delete cascade,
  error_pattern         text not null,
  native_language_code  text not null,
  feedback_text         text not null,
  created_at            timestamptz not null default now(),
  unique (card_id, error_pattern, native_language_code)
);

create index idx_feedback_cache_lookup
  on public.feedback_cache(card_id, error_pattern, native_language_code);

alter table public.feedback_cache enable row level security;

create policy "feedback_cache_select_authenticated"
on public.feedback_cache
for select
to authenticated
using (true);
-- No write policies → service-role only. Edge Functions populate the cache.

-- ── tier_change_log ────────────────────────────────────────────────────────
create table public.tier_change_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users(id) on delete restrict,
  target_id   uuid not null references auth.users(id) on delete restrict,
  from_tier   text not null,
  to_tier     text not null check (to_tier in ('free', 'pro', 'admin')),
  reason      text,
  created_at  timestamptz not null default now()
);

create index idx_tier_change_log_target
  on public.tier_change_log(target_id, created_at desc);

alter table public.tier_change_log enable row level security;

create policy "tier_change_log_select_admins"
on public.tier_change_log
for select
to authenticated
using (
  exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.is_admin = true
  )
);
-- No write policies → service-role only. flip-tier (5.2) is the writer.

-- ── bump_rate_limit RPC ────────────────────────────────────────────────────
-- Atomically increments today's count for (auth.uid(), p_bucket). Returns the
-- new count. Raises an exception with SQLSTATE P0001 and message starting
-- 'RATE_LIMITED' when count would exceed p_cap_per_day. SECURITY DEFINER so
-- the underlying INSERT/UPDATE on rate_limits bypasses the no-policy lock.
create or replace function public.bump_rate_limit(
  p_bucket       text,
  p_cap_per_day  integer
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
  if p_cap_per_day < 1 then
    raise exception 'invalid cap: %', p_cap_per_day using errcode = '22023';
  end if;

  insert into public.rate_limits (user_id, bucket, day, count)
       values (v_user_id, p_bucket, current_date, 1)
  on conflict (user_id, bucket, day)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  if v_count > p_cap_per_day then
    raise exception 'RATE_LIMITED: % exceeded cap % for bucket %',
      v_count, p_cap_per_day, p_bucket
    using errcode = 'P0001';
  end if;

  return v_count;
end;
$$;

revoke all on function public.bump_rate_limit(text, integer) from public;
grant execute on function public.bump_rate_limit(text, integer) to authenticated;
