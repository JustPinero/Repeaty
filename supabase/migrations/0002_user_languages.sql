-- 0002_user_languages.sql
-- A user can study multiple target languages, each at its own CEFR level.
-- Composite PK (user_id, language_code) enforces one row per (user, language).

create table public.user_languages (
  user_id        uuid not null references auth.users(id) on delete cascade,
  language_code  text not null,
  cefr_level     text not null check (cefr_level in ('A1','A2','B1','B2','C1','C2')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, language_code)
);

create trigger user_languages_set_updated_at
  before update on public.user_languages
  for each row
  execute function public.set_updated_at();

alter table public.user_languages enable row level security;
