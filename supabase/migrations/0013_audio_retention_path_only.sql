-- 0013_audio_retention_path_only.sql
-- Fix to 0012's `purge_free_tier_audio()`: Supabase blocks direct `DELETE FROM
-- storage.objects` (trigger: "Direct deletion from storage tables is not
-- allowed. Use the Storage API instead.") so we drop the storage delete from
-- this function and only NULL out `audio_storage_path` on stale free-tier
-- rows. The user-visible privacy property — no row references the audio,
-- Play button disappears — still holds.
--
-- The actual file-blob removal needs to call the Supabase Storage HTTP API
-- (or use a scheduled Edge Function). Tracked as DEBT-005 in audits/debt.md.
-- This migration is forward-only: 0012's pg_cron entry stays in place and
-- continues to fire — it just runs the new function body.

create or replace function public.purge_free_tier_audio()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_purged_count int;
begin
  update public.pronunciation_attempts a
     set audio_storage_path = null
    from public.profiles p
   where p.id = a.user_id
     and a.audio_storage_path is not null
     and a.created_at < now() - interval '7 days'
     and p.tier = 'free';

  get diagnostics v_purged_count = row_count;

  raise notice '%', json_build_object(
    'fn', 'purge_free_tier_audio',
    'purged_count', v_purged_count,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.purge_free_tier_audio() from public;
