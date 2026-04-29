-- 0005_attempts.sql
-- Per-attempt history for both pronunciation (Whisper-scored) and comprehension
-- (speed-scored). feedback_text is populated only for Pro tier (Phase 5).

create table public.pronunciation_attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  card_id             uuid not null references public.cards(id) on delete cascade,
  audio_storage_path  text not null,
  whisper_transcript  text not null,
  similarity_score    real not null check (similarity_score >= 0 and similarity_score <= 1),
  feedback_text       text,
  created_at          timestamptz not null default now()
);

create index idx_pron_user_card_created
  on public.pronunciation_attempts(user_id, card_id, created_at desc);

create table public.comprehension_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  card_id       uuid not null references public.cards(id) on delete cascade,
  response_ms   integer not null check (response_ms >= 0),
  correct       boolean not null,
  feedback_text text,
  created_at    timestamptz not null default now()
);

create index idx_comp_user_card_created
  on public.comprehension_attempts(user_id, card_id, created_at desc);

alter table public.pronunciation_attempts enable row level security;
alter table public.comprehension_attempts enable row level security;
