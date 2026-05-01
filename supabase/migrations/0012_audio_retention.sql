-- 0012_audio_retention.sql
-- Free-tier pronunciation audio is retained for 7 days; Pro/admin keeps it
-- indefinitely. The `pronunciation_attempts` row stays for history with
-- `audio_storage_path` NULLed when the file is reaped.
--
-- Implementation per Path A in `requests/phase-4-pronunciation/4.6-storage-retention.md`:
--   purge_free_tier_audio() — daily SQL function joining
--   pronunciation_attempts × profiles × storage.objects.
-- Scheduled via pg_cron at 03:00 UTC.

create extension if not exists pg_cron;

create or replace function public.purge_free_tier_audio()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_purged_count int;
begin
  -- Phase 1: delete the storage.objects rows for stale free-tier audio. The
  -- LEFT-JOIN-via-WHERE pattern lets us scope by tier without a subquery
  -- explosion. Service-role bypasses storage's path-prefix RLS, which is
  -- correct here — this is a system-level reaper, not a user action.
  delete from storage.objects o
  using public.pronunciation_attempts a
  join public.profiles p on p.id = a.user_id
  where o.bucket_id = 'pronunciation-audio'
    and a.audio_storage_path = o.name
    and a.audio_storage_path is not null
    and a.created_at < now() - interval '7 days'
    and p.tier = 'free';

  -- Phase 2: NULL out the path on those rows. Same WHERE shape so the two
  -- phases stay consistent. Pro/admin attempts are skipped.
  update public.pronunciation_attempts a
     set audio_storage_path = null
    from public.profiles p
   where p.id = a.user_id
     and a.audio_storage_path is not null
     and a.created_at < now() - interval '7 days'
     and p.tier = 'free';

  get diagnostics v_purged_count = row_count;

  -- Structured-JSON log line per references/api-contracts.md § Logging contract.
  raise notice '%', json_build_object(
    'fn', 'purge_free_tier_audio',
    'purged_count', v_purged_count,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.purge_free_tier_audio() from public;
-- Only service-role + the pg_cron daemon should call this.
-- (No `grant execute to authenticated` — direct user calls are forbidden.)

-- Daily at 03:00 UTC. The pg_cron cron.schedule call is idempotent against
-- the same jobname — re-running this migration is safe.
do $$
begin
  perform cron.unschedule('audio-retention-daily');
exception
  when others then
    -- jobname didn't exist yet — fine on first apply.
    null;
end;
$$;

select cron.schedule(
  'audio-retention-daily',
  '0 3 * * *',
  $cmd$ select public.purge_free_tier_audio(); $cmd$
);

-- Test helper: backdate a pronunciation_attempts row so the integration
-- test can drive the retention window without sleeping. Service-role only.
create or replace function public.test_force_attempt_age(
  p_attempt_id uuid,
  p_age text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format(
    'update public.pronunciation_attempts set created_at = now() - %L::interval where id = $1',
    p_age
  ) using p_attempt_id;
end;
$$;

revoke all on function public.test_force_attempt_age(uuid, text) from public;
-- Service-role only — never callable by `authenticated`.
