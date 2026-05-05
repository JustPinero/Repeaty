-- 0021_client_error_log.sql
-- Captures uncaught client-side errors so admins can triage what real users
-- hit. See requests/phase-8-operations/8.3-error-capture.md.
--
-- Design:
--   * Authenticated users may INSERT their own rows (auth.uid() = user_id).
--   * No SELECT policy — admins read via service-role from Studio, or via a
--     SECURITY DEFINER RPC if/when an in-app /admin/errors view ships.
--   * user_id defaults to auth.uid() so the client doesn't have to round-trip
--     for the JWT subject just to log an error.

create table public.client_error_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  message text not null,
  stack text null,
  route text null,
  app_version text null,
  user_agent text null,
  viewport_w int null,
  viewport_h int null,
  extra jsonb null,
  created_at timestamptz not null default now()
);

alter table public.client_error_log enable row level security;

create policy client_error_log_insert_own
  on public.client_error_log
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create index idx_client_error_log_user_created
  on public.client_error_log (user_id, created_at desc);
