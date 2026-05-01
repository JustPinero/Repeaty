import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('insert_ai_deck_with_cards RPC', () => {
  let user: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    user = await createTestUser('iadwc');
    other = await createTestUser('iadwc-other');
  });

  afterAll(async () => {
    if (user?.userId) await deleteTestUser(user.userId);
    if (other?.userId) await deleteTestUser(other.userId);
  });

  it('inserts the deck and all cards atomically; returns the new deck_id', async () => {
    const cards = [
      { target_text: 'pan', native_text: 'bread' },
      { target_text: 'agua', native_text: 'water' },
      { target_text: 'gracias', native_text: 'thank you' },
    ];
    const res = await user.client.rpc('insert_ai_deck_with_cards', {
      p_owner: user.userId,
      p_language: 'es',
      p_cefr: 'A1',
      p_deck_name: 'Test deck',
      p_cards: cards,
    });
    expect(res.error).toBeNull();
    expect(typeof res.data).toBe('string');

    const deckId = res.data as string;
    const deck = await getServiceClient()
      .from('decks')
      .select('id, name, owner_id, source, language_code')
      .eq('id', deckId)
      .single();
    expect(deck.data?.owner_id).toBe(user.userId);
    expect(deck.data?.source).toBe('ai_generated');
    expect(deck.data?.language_code).toBe('es');

    const insertedCards = await getServiceClient()
      .from('cards')
      .select('id')
      .eq('deck_id', deckId);
    expect((insertedCards.data ?? []).length).toBe(3);
  });

  it('rejects OWNER_MISMATCH when p_owner ≠ auth.uid()', async () => {
    const res = await user.client.rpc('insert_ai_deck_with_cards', {
      p_owner: other.userId,
      p_language: 'es',
      p_cefr: 'A1',
      p_deck_name: 'Hostile deck',
      p_cards: [{ target_text: 't', native_text: 'n' }],
    });
    expect(res.error).not.toBeNull();
    expect(res.error?.message).toMatch(/OWNER_MISMATCH/);
  });

  it('rejects EMPTY_DECK when p_cards is empty', async () => {
    const res = await user.client.rpc('insert_ai_deck_with_cards', {
      p_owner: user.userId,
      p_language: 'es',
      p_cefr: 'A1',
      p_deck_name: 'Empty deck',
      p_cards: [],
    });
    expect(res.error).not.toBeNull();
    expect(res.error?.message).toMatch(/EMPTY_DECK/);
  });
});
