-- 0004_reviews.sql
-- FSRS state, one row per (user, card). The fsrs_state JSONB blob is opaque to
-- the client UI — the @repeaty/shared FSRS implementation reads/writes it.

create table public.reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  card_id           uuid not null references public.cards(id) on delete cascade,
  ease              real not null,
  interval_days     real not null,
  due_at            timestamptz not null,
  last_reviewed_at  timestamptz,
  fsrs_state        jsonb not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, card_id)
);

create index idx_reviews_user_due on public.reviews(user_id, due_at);

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row
  execute function public.set_updated_at();

alter table public.reviews enable row level security;
