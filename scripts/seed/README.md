# scripts/seed/

Build-time generator for **bundled** decks — the starter decks every Repeaty user gets. Sources are YAML files in `decks/`; the generator emits `supabase/migrations/0009_seed_bundled_decks.sql` with idempotent `ON CONFLICT (id) DO UPDATE` upserts.

## Workflow

1. Edit a YAML in `decks/` (or add a new one — see [shape](#deck-shape) below).
2. Run `pnpm seed:decks` from the repo root.
3. Review the diff in `supabase/migrations/0009_seed_bundled_decks.sql` — only the rows you changed should change.
4. Commit the YAML *and* the regenerated migration together.

## Deck shape

```yaml
id: starter-es-a1                # stable slug — UUIDv5 derives from this; never rename
name: Spanish — Starter (A1)
language_code: es                # BCP-47
cefr_level: A1                   # one of A1, A2, B1, B2, C1, C2
cards:
  - target: hola
    native: hello
    ipa: ˈo.la                   # optional
    example_target: ¡Hola, ¿cómo estás?
    example_native: Hi, how are you?
  - target: gracias
    native: thank you
    ...
```

## Determinism

Deck and card UUIDs are derived via UUIDv5 from a fixed namespace UUID + the deck's `id` slug (and `id/index` for cards). Re-running `pnpm seed:decks` against the same YAML produces a byte-identical SQL file — useful in PRs to make changes visible.

**Never rename a deck's `id` or change a card's order**: doing so re-rolls the UUID and breaks all `reviews` rows that FK that card. Add new cards at the end of the list.

## v1 launch decks

| Slug              | Language | CEFR | Lands in         |
| ----------------- | -------- | ---- | ---------------- |
| `starter-es-a1`   | Spanish  | A1   | Phase 2 (here)   |
| `starter-fr-a1`   | French   | A1   | Phase 2 (here)   |
| `starter-de-a1`   | German   | A1   | Phase 6          |
| `starter-it-a1`   | Italian  | A1   | Phase 6          |
| `starter-ru-a1`   | Russian  | A1   | Phase 6          |
| `starter-ja-a1`   | Japanese | A1   | Phase 6          |
| `starter-zh-a1`   | Mandarin | A1   | Phase 6          |
