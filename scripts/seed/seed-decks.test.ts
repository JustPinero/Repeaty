import { describe, expect, it } from 'vitest';
import {
  generateMigrationSql,
  deckUuid,
  cardUuid,
  type DeckSpec,
} from './seed-decks';

const fixture: DeckSpec = {
  id: 'test-es-a1',
  name: 'Test Spanish A1',
  language_code: 'es',
  cefr_level: 'A1',
  cards: [
    { target: 'hola', native: 'hello' },
    { target: 'gracias', native: 'thank you', ipa: 'ˈɡɾa.sjas' },
    { target: 'sí', native: 'yes' },
  ],
};

describe('seed-decks', () => {
  it('generateMigrationSql is deterministic — identical input produces byte-identical output', () => {
    const a = generateMigrationSql([fixture]);
    const b = generateMigrationSql([fixture]);
    expect(a).toBe(b);
  });

  it('deckUuid is stable across calls (UUIDv5 from slug + fixed namespace)', () => {
    expect(deckUuid('test-es-a1')).toBe(deckUuid('test-es-a1'));
    expect(deckUuid('test-es-a1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('cardUuid is stable for the same (slug, index) and varies by index', () => {
    expect(cardUuid('test-es-a1', 0)).toBe(cardUuid('test-es-a1', 0));
    expect(cardUuid('test-es-a1', 0)).not.toBe(cardUuid('test-es-a1', 1));
  });

  it("escapes single-quotes in card text (e.g. French \"s'il vous plaît\")", () => {
    const sql = generateMigrationSql([
      { ...fixture, cards: [{ target: "s'il vous plaît", native: 'please' }] },
    ]);
    expect(sql).toContain("'s''il vous plaît'");
  });

  it('emits ON CONFLICT (id) DO UPDATE for both decks and cards (idempotent re-apply)', () => {
    const sql = generateMigrationSql([fixture]);
    expect(sql).toMatch(/insert into public\.decks[\s\S]*on conflict \(id\) do update/);
    expect(sql).toMatch(/insert into public\.cards[\s\S]*on conflict \(id\) do update/);
  });

  it('sorts deck specs by id for stable cross-spec ordering (input order does not matter)', () => {
    const a: DeckSpec = { ...fixture, id: 'a-deck' };
    const b: DeckSpec = { ...fixture, id: 'b-deck' };
    const forward = generateMigrationSql([a, b]);
    const reverse = generateMigrationSql([b, a]);
    expect(forward).toBe(reverse);
  });

  it('produces no Date.now()-derived content in the header (stability under time)', () => {
    const sql = generateMigrationSql([fixture]);
    // No ISO timestamp, no unix epoch — header should mention only the
    // generator script + seed-decks workflow, not when it ran.
    expect(sql).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/); // ISO-8601
    expect(sql).not.toMatch(/\b\d{10,13}\b/); // unix-second / unix-ms
  });
});
