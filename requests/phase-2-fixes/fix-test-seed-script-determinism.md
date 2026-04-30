# Fix — Add seed-script determinism test

## What's missing
`scripts/seed/seed-decks.test.ts` does not exist. Request 2.1's acceptance matrix lists this file by name with a single criterion: "running the script twice produces byte-identical SQL output". The file was never authored during Phase 2.

## Why it matters
The entire point of UUIDv5 (over UUIDv4) and pre-sorting deck specs in `loadDeckSpecs` is byte-stable migration regeneration — without it, every `pnpm seed:decks` produces a different SQL diff and the migration becomes useless as a regen artifact. A future regression (e.g. someone adds `Date.now()` to the header comment, drops the `entries.sort()`, or changes the namespace UUID) would silently corrupt the deterministic-seed contract and break re-runs. The acceptance criterion is currently unverified.

## Proposed test
`scripts/seed/seed-decks.test.ts` (or `.spec.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { generateMigrationSql, deckUuid, cardUuid, type DeckSpec } from './seed-decks';

const fixtureSpec: DeckSpec = {
  id: 'test-es-a1',
  name: 'Test Spanish A1',
  language_code: 'es',
  cefr_level: 'A1',
  cards: [
    { target: 'hola', native: 'hello' },
    { target: 'gracias', native: 'thank you', ipa: 'ˈɡɾa.sjas' },
    { target: 'sí', native: "yes" },
  ],
};

describe('seed-decks', () => {
  it('generateMigrationSql is deterministic — same input produces byte-identical output', () => {
    const a = generateMigrationSql([fixtureSpec]);
    const b = generateMigrationSql([fixtureSpec]);
    expect(a).toBe(b);
  });

  it('deckUuid is stable across calls (UUIDv5 of slug)', () => {
    expect(deckUuid('test-es-a1')).toBe(deckUuid('test-es-a1'));
    expect(deckUuid('test-es-a1')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('cardUuid is stable for the same (slug, index)', () => {
    expect(cardUuid('test-es-a1', 0)).toBe(cardUuid('test-es-a1', 0));
    expect(cardUuid('test-es-a1', 0)).not.toBe(cardUuid('test-es-a1', 1));
  });

  it('escapes single-quotes in target/native text', () => {
    const sql = generateMigrationSql([
      { ...fixtureSpec, cards: [{ target: "s'il vous plaît", native: 'please' }] },
    ]);
    expect(sql).toContain("'s''il vous plaît'");
  });

  it('emits ON CONFLICT DO UPDATE for both decks and cards (idempotent re-apply)', () => {
    const sql = generateMigrationSql([fixtureSpec]);
    expect(sql).toMatch(/insert into public\.decks[\s\S]*on conflict \(id\) do update/);
    expect(sql).toMatch(/insert into public\.cards[\s\S]*on conflict \(id\) do update/);
  });

  it('sorts decks by id slug for stable cross-spec ordering', () => {
    const a: DeckSpec = { ...fixtureSpec, id: 'a-deck' };
    const b: DeckSpec = { ...fixtureSpec, id: 'b-deck' };
    const forward = generateMigrationSql([a, b]);
    const reverse = generateMigrationSql([b, a]);
    expect(forward).toBe(reverse);
  });
});
```

## Files to touch
New:
- `scripts/seed/seed-decks.test.ts`

Updated (none):
- `scripts/seed/seed-decks.ts` — exports `generateMigrationSql`, `deckUuid`, `cardUuid` already

The root vitest config (apps/web's) needs to be checked for whether it picks up `scripts/seed/*.test.ts`. If it doesn't, either (a) add a top-level vitest workspace config or (b) move the test to `apps/web/tests/unit/seed-decks.test.ts` and import from `../../../scripts/seed/seed-decks`.

## Acceptance criteria
- `seed-decks.test.ts` runs in CI alongside other unit tests.
- All six assertions above pass.
- Mutating `seed-decks.ts` to add `Date.now()` to the header (or removing the `entries.sort()`) causes at least one assertion to fail.
- `pnpm seed:decks` followed by `git diff supabase/migrations/0009_seed_bundled_decks.sql` reports no changes against a clean checkout.
