-- 0006_rls_policies.sql
-- RLS policies for every user-owned table. Default-deny is established by
-- enabling RLS without policies in earlier migrations; this migration adds the
-- explicit allow rules.
--
-- Conventions:
--   * SELECT/INSERT/UPDATE/DELETE on user-owned rows: auth.uid() = owner column.
--   * profiles.tier and profiles.is_admin are NOT user-mutable — UPDATE policy
--     uses a column-allowlist via a WITH CHECK that pins those two columns.
--   * Bundled decks (source = 'bundled') are world-readable to authenticated
--     users; non-bundled decks are owner-only.
--   * Cards inherit visibility via deck (a JOIN-style policy using EXISTS).

-- ─── profiles ─────────────────────────────────────────────────────────────────
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Pin tier and is_admin to their pre-update values so the user cannot
    -- self-promote. service_role bypasses RLS and is the only path to flip these.
    and tier = (select p.tier from public.profiles p where p.id = auth.uid())
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
  );

-- INSERT into profiles is via the on_auth_user_created trigger only (security definer),
-- which bypasses RLS. No INSERT policy for the authenticated role.

-- ─── user_languages ───────────────────────────────────────────────────────────
create policy user_languages_select_own on public.user_languages
  for select to authenticated
  using (auth.uid() = user_id);

create policy user_languages_insert_own on public.user_languages
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy user_languages_update_own on public.user_languages
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_languages_delete_own on public.user_languages
  for delete to authenticated
  using (auth.uid() = user_id);

-- ─── decks ────────────────────────────────────────────────────────────────────
create policy decks_select_visible on public.decks
  for select to authenticated
  using (
    deleted_at is null
    and (source = 'bundled' or owner_id = auth.uid())
  );

create policy decks_insert_own on public.decks
  for insert to authenticated
  with check (
    -- Authenticated users may create owned decks only (never bundled — service
    -- role seeds those).
    owner_id = auth.uid() and source <> 'bundled'
  );

create policy decks_update_own on public.decks
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy decks_delete_own on public.decks
  for delete to authenticated
  using (owner_id = auth.uid());

-- ─── cards ────────────────────────────────────────────────────────────────────
-- Cards visibility = parent deck visibility.
create policy cards_select_via_deck on public.cards
  for select to authenticated
  using (
    exists (
      select 1 from public.decks d
       where d.id = cards.deck_id
         and d.deleted_at is null
         and (d.source = 'bundled' or d.owner_id = auth.uid())
    )
  );

create policy cards_insert_via_owned_deck on public.cards
  for insert to authenticated
  with check (
    exists (
      select 1 from public.decks d
       where d.id = cards.deck_id
         and d.owner_id = auth.uid()
    )
  );

create policy cards_update_via_owned_deck on public.cards
  for update to authenticated
  using (
    exists (
      select 1 from public.decks d
       where d.id = cards.deck_id
         and d.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.decks d
       where d.id = cards.deck_id
         and d.owner_id = auth.uid()
    )
  );

create policy cards_delete_via_owned_deck on public.cards
  for delete to authenticated
  using (
    exists (
      select 1 from public.decks d
       where d.id = cards.deck_id
         and d.owner_id = auth.uid()
    )
  );

-- ─── reviews ──────────────────────────────────────────────────────────────────
create policy reviews_select_own on public.reviews
  for select to authenticated
  using (auth.uid() = user_id);

create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy reviews_update_own on public.reviews
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy reviews_delete_own on public.reviews
  for delete to authenticated
  using (auth.uid() = user_id);

-- ─── pronunciation_attempts ──────────────────────────────────────────────────
create policy pron_select_own on public.pronunciation_attempts
  for select to authenticated
  using (auth.uid() = user_id);

create policy pron_insert_own on public.pronunciation_attempts
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy pron_update_own on public.pronunciation_attempts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy pron_delete_own on public.pronunciation_attempts
  for delete to authenticated
  using (auth.uid() = user_id);

-- ─── comprehension_attempts ──────────────────────────────────────────────────
create policy comp_select_own on public.comprehension_attempts
  for select to authenticated
  using (auth.uid() = user_id);

create policy comp_insert_own on public.comprehension_attempts
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy comp_update_own on public.comprehension_attempts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy comp_delete_own on public.comprehension_attempts
  for delete to authenticated
  using (auth.uid() = user_id);
