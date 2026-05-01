-- 0014_audio_storage_path_nullable.sql
-- 0005 declared `pronunciation_attempts.audio_storage_path` as `NOT NULL`,
-- but `references/schema.md` and the retention design (4.6) require it to
-- become NULL when the file is reaped — the row stays for history with the
-- score + transcript, just no link to the audio. Drop the NOT NULL.
--
-- This is intentionally a separate forward-only migration so 0005 stays
-- byte-stable in repo history.

alter table public.pronunciation_attempts
  alter column audio_storage_path drop not null;
