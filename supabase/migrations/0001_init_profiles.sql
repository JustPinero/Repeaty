-- 0001_init_profiles.sql
-- Profiles table extends auth.users (one row per user, populated by trigger on signup,
-- completed during onboarding). RLS enabled with policies that enforce auth.uid()
-- ownership and prevent self-service tier/admin escalation.

-- ─── Tier enum (as a CHECK on the column for portability) ─────────────────────
-- We avoid a real Postgres enum to keep migrations easy: adding values to a real
-- enum requires ALTER TYPE which is awkward in transactional migrations.

create extension if not exists pgcrypto;

create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  -- display_name and native_language_code are populated during onboarding (Request 1.4),
  -- so they're nullable at signup. Onboarding completion enforces both.
  display_name          text,
  email                 text not null,
  native_language_code  text,
  tier                  text not null default 'free' check (tier in ('free', 'pro', 'admin')),
  is_admin              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Trigger: when a new auth.users row is created, insert the matching profile.
-- Note: COALESCE on email guards against future OAuth flows where email may be
-- briefly null during the sign-up transaction.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Trigger: keep profiles.email synced with auth.users.email
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = coalesce(new.email, '')
     where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  execute function public.handle_user_email_change();

-- RLS: enable now; explicit policies land in 0006.
alter table public.profiles enable row level security;
