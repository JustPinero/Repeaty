# Schema — Repeaty

Source of truth for the database. Authoritative SQL lives in `supabase/migrations/`. This doc explains intent and RLS policies; `drift-audit` keeps it in sync.

## Conventions

- All primary keys are `UUID` (`gen_random_uuid()`).
- All timestamps are `TIMESTAMPTZ NOT NULL DEFAULT now()`.
- All user-owned tables have `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.
- Soft deletes use `deleted_at TIMESTAMPTZ NULL`. RLS read policies filter `deleted_at IS NULL`.
- Every table has RLS **enabled**. Tables without explicit policies are locked to all access — that's the point.

## Tables

### `profiles`
Extends `auth.users`. One row per user, created by trigger on `auth.users` insert. The trigger fires before onboarding completes, so `display_name` and `native_language_code` are nullable at creation and filled in during the onboarding flow (Request 1.4).

| Column                 | Type                              | Notes                                                       |
| ---------------------- | --------------------------------- | ----------------------------------------------------------- |
| id                     | UUID PK, FK auth.users(id)        | Same as auth user id                                        |
| display_name           | TEXT NULL                         | Set during onboarding                                       |
| email                  | TEXT NOT NULL                     | Mirror of auth.users.email; updated by trigger              |
| native_language_code   | TEXT NULL                         | BCP-47 (e.g. `en-US`, `es-ES`); set during onboarding       |
| tier                   | TEXT NOT NULL DEFAULT 'free'      | enum-like: `free` \| `pro` \| `admin` (CHECK constraint)    |
| is_admin               | BOOLEAN NOT NULL DEFAULT false    | Gates `/admin` route; orthogonal to `tier`                  |
| created_at             | TIMESTAMPTZ                       |                                                             |
| updated_at             | TIMESTAMPTZ                       | Trigger-maintained                                          |

**RLS:**
- `SELECT`: `auth.uid() = id`
- `UPDATE`: `auth.uid() = id` AND `tier` / `is_admin` pinned to their pre-update values (subselect-anchored `WITH CHECK`). `tier` and `is_admin` are flipped only via service-role (i.e. `/admin` flips via Edge Function in Phase 5 — see [DEBT-001](../audits/debt.md) for billing-driven flips later).
- No `INSERT` policy: rows are created exclusively by the `on_auth_user_created` trigger (security definer, bypasses RLS).

### `user_languages`
A user can study multiple languages, each at its own CEFR level.

| Column           | Type           | Notes                                            |
| ---------------- | -------------- | ------------------------------------------------ |
| user_id          | UUID, FK       | composite PK with `language_code`                |
| language_code    | TEXT           | BCP-47                                           |
| cefr_level       | TEXT NOT NULL  | CHECK in (`A1`,`A2`,`B1`,`B2`,`C1`,`C2`)         |
| created_at       | TIMESTAMPTZ    |                                                  |
| updated_at       | TIMESTAMPTZ    |                                                  |

**RLS:** `SELECT`/`INSERT`/`UPDATE`/`DELETE` all `auth.uid() = user_id`.

### `decks`
Bundled (built into the app) or owned (AI-generated, imported).

| Column         | Type                              | Notes                                                       |
| -------------- | --------------------------------- | ----------------------------------------------------------- |
| id             | UUID PK                           |                                                             |
| name           | TEXT NOT NULL                     |                                                             |
| language_code  | TEXT NOT NULL                     | target language                                             |
| cefr_level     | TEXT NOT NULL                     | `A1`..`C2`                                                  |
| source         | TEXT NOT NULL                     | enum: `bundled` \| `ai_generated` \| `imported`             |
| owner_id       | UUID NULL, FK auth.users(id)      | NULL when source = `bundled`, NOT NULL otherwise (CHECK)    |
| created_at     | TIMESTAMPTZ                       |                                                             |
| deleted_at     | TIMESTAMPTZ NULL                  | soft delete                                                 |

**Constraints:** `decks_owner_matches_source` CHECK — `(source = 'bundled' AND owner_id IS NULL) OR (source <> 'bundled' AND owner_id IS NOT NULL)`. Prevents both orphaned non-bundled decks and accidentally-owned bundled decks.
**Indexes:** `idx_decks_owner (owner_id) WHERE owner_id IS NOT NULL`, `idx_decks_source_language (source, language_code)`.

**RLS:**
- `SELECT`: `(source = 'bundled' AND deleted_at IS NULL) OR (owner_id = auth.uid() AND deleted_at IS NULL)`
- `INSERT`: only with `owner_id = auth.uid()`. Service-role bypasses for bundled deck seeding.
- `UPDATE`/`DELETE`: `owner_id = auth.uid()`.

### `cards`

| Column                    | Type           | Notes                                              |
| ------------------------- | -------------- | -------------------------------------------------- |
| id                        | UUID PK        |                                                    |
| deck_id                   | UUID FK decks  | ON DELETE CASCADE                                  |
| target_text               | TEXT NOT NULL  | the word/phrase in the language being learned      |
| native_text               | TEXT NOT NULL  | translation in user's native language              |
| ipa                       | TEXT NULL      | phonetic, optional                                 |
| example_sentence_target   | TEXT NULL      |                                                    |
| example_sentence_native   | TEXT NULL      |                                                    |
| language_code             | TEXT NOT NULL  | denormalized from deck for query-path indexing     |
| created_at                | TIMESTAMPTZ    |                                                    |

**RLS:** inherited via deck — `SELECT` allowed when the deck is visible (bundled OR owned by user).
**Indexes:** `idx_cards_deck_id (deck_id)`, `idx_cards_language (language_code)`.

### `reviews`
FSRS state, one row per (user, card).

| Column           | Type                              | Notes                                                |
| ---------------- | --------------------------------- | ---------------------------------------------------- |
| id               | UUID PK                           |                                                      |
| user_id          | UUID FK auth.users                |                                                      |
| card_id          | UUID FK cards                     |                                                      |
| ease             | REAL NOT NULL                     | denormalized from FSRS difficulty for legacy queries |
| interval_days    | REAL NOT NULL                     | denormalized from `fsrs_state.scheduled_days`        |
| due_at           | TIMESTAMPTZ NOT NULL              | denormalized from `fsrs_state.due` for indexed query |
| last_reviewed_at | TIMESTAMPTZ NULL                  | denormalized from `fsrs_state.last_review`           |
| fsrs_state       | JSONB NOT NULL                    | matches the `FsrsState` type in `@repeaty/shared/fsrs` (carries `v: 1` schema version + ts-fsrs scheduler fields). Authoritative — denormalized columns above are for query convenience. |
| created_at       | TIMESTAMPTZ                       |                                                      |
| updated_at       | TIMESTAMPTZ                       |                                                      |

**Constraints:** `UNIQUE (user_id, card_id)`.
**Indexes:** `idx_reviews_user_due (user_id, due_at)` for the daily-queue query.
**RLS:** all ops `auth.uid() = user_id`.

### `pronunciation_attempts`

| Column            | Type                              | Notes                                                |
| ----------------- | --------------------------------- | ---------------------------------------------------- |
| id                | UUID PK                           |                                                      |
| user_id           | UUID FK auth.users                |                                                      |
| card_id           | UUID FK cards                     |                                                      |
| audio_storage_path| TEXT NULL                         | path in Supabase Storage bucket `pronunciation-audio`. Nullable: NULLed by the retention job when the file is reaped (per 0014; was NOT NULL in 0005) |
| whisper_transcript| TEXT NOT NULL                     |                                                      |
| similarity_score  | REAL NOT NULL                     | 0.0–1.0 normalized Levenshtein for v1                |
| feedback_text     | TEXT NULL                         | populated only for Pro tier                          |
| created_at        | TIMESTAMPTZ                       |                                                      |

**Indexes:** `idx_pron_user_card_created (user_id, card_id, created_at DESC)` for history view.
**RLS:** all ops `auth.uid() = user_id`. Storage bucket has matching path-prefix policy — see `pronunciation-audio` § below.
**Storage retention:** Daily pg_cron job `audio-retention-daily` (03:00 UTC) calls `purge_free_tier_audio()` which NULLs `pronunciation_attempts.audio_storage_path` for free-tier rows older than 7 days, hiding the audio from the UI's history view (the Play button only renders when `audio_storage_path IS NOT NULL`). The underlying file blob in `storage.objects` is **not** removed in v1 — Supabase blocks direct `DELETE FROM storage.objects` from any role with a trigger. End-to-end file-blob cleanup lands when [DEBT-005](../audits/debt.md) activates (an Edge Function calling the Supabase Storage HTTP API). Pro/admin audio is preserved indefinitely. Implemented in 0012 (Request 4.6); pruned to path-only in 0013; column nullability in 0014.

## Storage buckets

### `pronunciation-audio` (Phase 4, Request 4.3)

Private bucket (`public = false`) holding the recorded audio for `pronunciation_attempts`. Naming convention enforced by `apps/web/src/features/pronunciation/storage.ts`:

```
${user_id}/${card_id}/<uuidv4>.<ext>
```

`<ext>` is `webm` (Chrome/Firefox/Edge), `mp4` (iOS Safari), `mp3`/`ogg`/`wav` for Phase-5 backfills, or `bin` if mime is unknown. The 10 MB blob cap (`MAX_AUDIO_BYTES`) is enforced helper-side before the upload call.

**RLS (migration 0011):** `(SELECT auth.uid())::text = (storage.foldername(name))[1]` on SELECT/INSERT/UPDATE/DELETE for `bucket_id = 'pronunciation-audio'`. Cross-user reads + writes are blocked at the storage layer — see `apps/web/tests/integration/supabase/bucket-rls.test.ts`.

The `score-pronunciation` Edge Function (4.4) downloads via the service-role client (RLS bypass) but still verifies `audio_storage_path.startsWith(\`${user_id}/\`)` as a path-traversal defense — the helper enforces this on write, and the Edge Function re-asserts on read.

### `comprehension_attempts`

| Column         | Type                              | Notes                                                |
| -------------- | --------------------------------- | ---------------------------------------------------- |
| id             | UUID PK                           |                                                      |
| user_id        | UUID FK auth.users                |                                                      |
| card_id        | UUID FK cards                     |                                                      |
| response_ms    | INTEGER NOT NULL                  | response latency in milliseconds                     |
| correct        | BOOLEAN NOT NULL                  |                                                      |
| feedback_text  | TEXT NULL                         | Pro-only                                             |
| created_at     | TIMESTAMPTZ                       |                                                      |

**Indexes:** `idx_comp_user_card_created (user_id, card_id, created_at DESC)`.
**RLS:** all ops `auth.uid() = user_id`.

## RPCs

### `complete_onboarding(p_display_name TEXT, p_native_language_code TEXT, p_targets JSONB) → VOID` (Phase 1, Request 1.4)
Atomic write across `profiles` + `user_languages` so the onboarding wizard can never leave the user in a half-onboarded state. SECURITY INVOKER (RLS still applies; `auth.uid()` is asserted to be non-null inside the function).

`p_targets` is a JSONB array of `{ "language_code": string, "cefr_level": "A1"|"A2"|"B1"|"B2"|"C1"|"C2" }` objects. Inserts use `ON CONFLICT (user_id, language_code) DO UPDATE` so re-running onboarding (e.g. to change CEFR level) is idempotent.

Validation surfaces helpful Postgres error codes:
- `42501` — not authenticated
- `22023` — empty `display_name`, empty `native_language_code`, empty `targets` array, missing `language_code`, or invalid `cefr_level`

`GRANT EXECUTE TO authenticated`.

## Auxiliary

### `feedback_cache` (Phase 5)
Caches AI-generated feedback by error pattern to avoid redundant Claude calls.

| Column         | Type                              | Notes                                                |
| -------------- | --------------------------------- | ---------------------------------------------------- |
| id             | UUID PK                           |                                                      |
| card_id        | UUID FK cards                     |                                                      |
| error_pattern  | TEXT NOT NULL                     | normalized pattern key (e.g. transcript-vs-target diff hash) |
| native_language_code | TEXT NOT NULL              | feedback is locale-dependent                         |
| feedback_text  | TEXT NOT NULL                     |                                                      |
| created_at     | TIMESTAMPTZ                       |                                                      |

**Constraints:** `UNIQUE (card_id, error_pattern, native_language_code)`.
**RLS:** read-only public; writes via service-role only.

### `rate_limits` (Phase 5)
Per-user daily counters for paid-tier features.

| Column         | Type                              | Notes                                                |
| -------------- | --------------------------------- | ---------------------------------------------------- |
| user_id        | UUID FK auth.users                | composite PK with `bucket` + `day`                   |
| bucket         | TEXT NOT NULL                     | enum: `lesson_generation` \| `feedback_generation`   |
| day            | DATE NOT NULL                     | UTC date                                             |
| count          | INTEGER NOT NULL DEFAULT 0        |                                                      |

**RLS:** `SELECT` `auth.uid() = user_id`; writes via service-role only.

## Triggers

- `on_auth_user_created` → inserts a `profiles` row when `auth.users` gets a new row.
- `on_auth_user_email_changed` → keeps `profiles.email` synced.
- `on_decks_update` / `on_profiles_update` / `on_user_languages_update` → bump `updated_at`.

## Migrations naming

`NNNN_<description>.sql`, append-only. `NNNN` is zero-padded 4 digits.

Phase 1 migrations:
- `0001_init_profiles.sql` — `profiles` table, `set_updated_at()` helper, `on_auth_user_created` + `on_auth_user_email_changed` triggers
- `0002_user_languages.sql`
- `0003_decks_cards.sql` — `decks` and `cards` plus the `decks_owner_matches_source` CHECK and the deck/card indexes
- `0004_reviews.sql`
- `0005_attempts.sql`
- `0006_rls_policies.sql` — every RLS policy in one transaction
- `0007_onboarding_rpc.sql` — `complete_onboarding(p_display_name, p_native_language_code, p_targets)` RPC (see § Auxiliary)
- `0008_rls_check_helper.sql` — `_test_relrowsecurity(p_table)` test-only helper (service_role only) so the integration suite can assert RLS is enabled on every public table

Phase 2 migrations:
- `0009_seed_bundled_decks.sql` — auto-generated by `scripts/seed/seed-decks.ts` from YAML deck specs. Bundled deck and card UUIDs are deterministic UUIDv5 values derived from a pinned namespace (`8e1b3a4a-7f71-4f9b-b1d8-3b2c1a0d9e7c`) plus the slug / `slug/index`, so the migration is byte-stable across regenerations and downstream code can hardcode bundled-deck UUIDs when needed. Idempotent re-application via `on conflict (id) do update`. Never rename a deck slug or reorder cards — both inputs feed the UUIDv5 derivation.

Convention for later phases:
- `NNNN_defer_<feature>.sql` for `/defer` migrations
- `NNNN_activate_<feature>.sql` for `/activate` migrations

Never edit a migration after it's been applied to a remote env. Forward-only.
