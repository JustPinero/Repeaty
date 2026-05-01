import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('bundled decks', () => {
  let user: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    user = await createTestUser('bundled');
  });

  afterAll(async () => {
    if (user?.userId) await deleteTestUser(user.userId);
  });

  it('seeds a Spanish A1 starter deck', async () => {
    const service = getServiceClient();
    const { data, error } = await service
      .from('decks')
      .select('id, name, language_code, cefr_level, source, owner_id')
      .eq('language_code', 'es')
      .eq('source', 'bundled')
      .eq('cefr_level', 'A1');
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    const deck = data?.[0];
    expect(deck).toBeDefined();
    expect(deck!.owner_id).toBeNull();
    expect(deck!.name).toMatch(/spanish/i);
  });

  it('seeds a French A1 starter deck', async () => {
    const service = getServiceClient();
    const { data, error } = await service
      .from('decks')
      .select('id, name, language_code, cefr_level, source, owner_id')
      .eq('language_code', 'fr')
      .eq('source', 'bundled')
      .eq('cefr_level', 'A1');
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    const deck = data?.[0];
    expect(deck).toBeDefined();
    expect(deck!.owner_id).toBeNull();
    expect(deck!.name).toMatch(/french/i);
  });

  it('each of the 7 starter languages has a Phase-1-A1 deck with 25–35 cards', async () => {
    const service = getServiceClient();
    for (const lang of ['es', 'fr', 'de', 'it', 'ru', 'ja', 'zh']) {
      const decks = await service
        .from('decks')
        .select('id')
        .eq('language_code', lang)
        .eq('source', 'bundled')
        .eq('cefr_level', 'A1')
        .single();
      expect(decks.error).toBeNull();
      const cards = await service
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', decks.data!.id);
      expect(cards.error).toBeNull();
      expect(cards.count, `expected 25–35 cards in ${lang} deck, got ${cards.count}`).toBeGreaterThanOrEqual(25);
      expect(cards.count, `expected 25–35 cards in ${lang} deck, got ${cards.count}`).toBeLessThanOrEqual(35);
    }
  });

  it('ja and zh bundled cards each carry a non-empty ipa (Whisper phonetic anchor)', async () => {
    const service = getServiceClient();
    // The `ipa` column is nullable on `cards` (Phase 1.2) and the schema
    // permits non-CJK cards to leave it null. Phase 6.1 commits to ipa for
    // every ja and zh card — kana romanization and pinyin-with-tone-marks,
    // respectively. Regress on either (seed-decks.ts dropping the field, a
    // YAML edit losing it) and Whisper-anchored learners are flying blind.
    for (const lang of ['ja', 'zh']) {
      const deck = await service
        .from('decks')
        .select('id')
        .eq('language_code', lang)
        .eq('source', 'bundled')
        .eq('cefr_level', 'A1')
        .single();
      expect(deck.error, `expected a bundled ${lang} A1 deck`).toBeNull();
      const cards = await service
        .from('cards')
        .select('target_text, ipa')
        .eq('deck_id', deck.data!.id);
      expect(cards.error).toBeNull();
      expect((cards.data ?? []).length).toBeGreaterThan(0);
      for (const card of cards.data ?? []) {
        expect(
          card.ipa,
          `expected ipa on ${lang} card "${card.target_text}"`,
        ).not.toBeNull();
        expect(
          (card.ipa ?? '').trim().length,
          `expected non-empty ipa on ${lang} card "${card.target_text}"`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('every bundled card has target_text, native_text, and language_code', async () => {
    const service = getServiceClient();
    // Fetch all bundled-deck cards and assert no required field is empty.
    const decks = await service
      .from('decks')
      .select('id')
      .eq('source', 'bundled');
    expect(decks.error).toBeNull();
    const ids = (decks.data ?? []).map((d) => d.id);
    expect(ids.length).toBeGreaterThan(0);

    const cards = await service
      .from('cards')
      .select('target_text, native_text, language_code')
      .in('deck_id', ids);
    expect(cards.error).toBeNull();
    for (const card of cards.data ?? []) {
      expect(card.target_text?.length ?? 0).toBeGreaterThan(0);
      expect(card.native_text?.length ?? 0).toBeGreaterThan(0);
      expect(card.language_code?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('Spanish starter deck includes the standard A1 greetings', async () => {
    const service = getServiceClient();
    const deck = await service
      .from('decks')
      .select('id')
      .eq('language_code', 'es')
      .eq('source', 'bundled')
      .single();
    const cards = await service
      .from('cards')
      .select('target_text')
      .eq('deck_id', deck.data!.id);
    const targets = (cards.data ?? []).map((c) => c.target_text.toLowerCase());
    for (const greeting of ['hola', 'gracias', 'por favor', 'sí', 'no', 'adiós']) {
      expect(targets, `expected Spanish deck to contain "${greeting}"`).toContain(greeting);
    }
  });

  it('French starter deck includes the standard A1 greetings', async () => {
    const service = getServiceClient();
    const deck = await service
      .from('decks')
      .select('id')
      .eq('language_code', 'fr')
      .eq('source', 'bundled')
      .single();
    const cards = await service
      .from('cards')
      .select('target_text')
      .eq('deck_id', deck.data!.id);
    const targets = (cards.data ?? []).map((c) => c.target_text.toLowerCase());
    for (const greeting of ['bonjour', 'merci', "s'il vous plaît", 'oui', 'non', 'au revoir']) {
      expect(targets, `expected French deck to contain "${greeting}"`).toContain(greeting);
    }
  });

  it('an authenticated test user can read both bundled decks (RLS)', async () => {
    const { data, error } = await user.client
      .from('decks')
      .select('id, language_code, source')
      .eq('source', 'bundled')
      .in('language_code', ['es', 'fr']);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(2);
  });
});
