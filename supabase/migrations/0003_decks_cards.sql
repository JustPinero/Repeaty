-- 0003_decks_cards.sql
-- Decks (bundled, AI-generated, or imported) and cards (one row per learnable
-- target-language word/phrase). Cards.language_code is denormalized from deck
-- to keep the cards-by-language query path single-table.

create table public.decks (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  language_code  text not null,
  cefr_level     text not null check (cefr_level in ('A1','A2','B1','B2','C1','C2')),
  source         text not null check (source in ('bundled', 'ai_generated', 'imported')),
  -- owner_id is null when source = 'bundled' (world-readable); enforced by check.
  owner_id       uuid references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint decks_owner_matches_source check (
    (source = 'bundled' and owner_id is null) or
    (source <> 'bundled' and owner_id is not null)
  )
);

create index idx_decks_owner on public.decks(owner_id) where owner_id is not null;
create index idx_decks_source_language on public.decks(source, language_code);

create table public.cards (
  id                       uuid primary key default gen_random_uuid(),
  deck_id                  uuid not null references public.decks(id) on delete cascade,
  target_text              text not null,
  native_text              text not null,
  ipa                      text,
  example_sentence_target  text,
  example_sentence_native  text,
  language_code            text not null,
  created_at               timestamptz not null default now()
);

create index idx_cards_deck_id on public.cards(deck_id);
create index idx_cards_language on public.cards(language_code);

alter table public.decks enable row level security;
alter table public.cards enable row level security;
