-- 0011_pronunciation_audio_bucket.sql
-- Storage bucket for Phase-4 pronunciation audio + path-prefix RLS so user A
-- can never read or write under user B's prefix. Object naming convention is
-- enforced by the helper at apps/web/src/features/pronunciation/storage.ts:
--   `${user_id}/${card_id}/<uuid>.<ext>`
-- The first path segment is the owning user — everything else is enforced
-- here by the storage.foldername() check.
--
-- Bucket is private (`public = false`); reads happen server-side via the
-- score-pronunciation Edge Function (4.4) using the service-role client, and
-- the playback path uses signed URLs from the user-context client.
--
-- 7-day retention for free-tier users lands in 0012 via pg_cron (Request 4.6).

insert into storage.buckets (id, name, public)
values ('pronunciation-audio', 'pronunciation-audio', false)
on conflict (id) do update set public = excluded.public;

-- Drop any prior policies with these names so this migration is re-runnable
-- against a partially-applied state.
drop policy if exists "pronunciation_audio_select_own" on storage.objects;
drop policy if exists "pronunciation_audio_insert_own" on storage.objects;
drop policy if exists "pronunciation_audio_update_own" on storage.objects;
drop policy if exists "pronunciation_audio_delete_own" on storage.objects;

-- Path-prefix policies — `(storage.foldername(name))[1]` is the first path
-- segment, which by convention is the owner's user_id.
create policy "pronunciation_audio_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pronunciation-audio'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "pronunciation_audio_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pronunciation-audio'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "pronunciation_audio_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pronunciation-audio'
  and (select auth.uid())::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'pronunciation-audio'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "pronunciation_audio_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pronunciation-audio'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);
