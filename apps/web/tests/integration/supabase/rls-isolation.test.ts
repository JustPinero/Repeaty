import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('RLS isolation between users', () => {
  let userA: TestUser;
  let userB: TestUser;
  let bundledDeckId: string;
  let aiDeckId: string;

  beforeAll(async () => {
    ensureIntegrationEnv();
    userA = await createTestUser('A');
    userB = await createTestUser('B');

    // Seed a bundled deck via service role (bundled = owner_id NULL).
    const service = getServiceClient();
    const bundled = await service
      .from('decks')
      .insert({
        name: 'rls-test bundled',
        language_code: 'es',
        cefr_level: 'A1',
        source: 'bundled',
      })
      .select()
      .single();
    if (bundled.error) throw new Error(bundled.error.message);
    bundledDeckId = bundled.data.id;

    // userA creates an AI-generated deck.
    const ai = await userA.client
      .from('decks')
      .insert({
        name: 'rls-test ai (A)',
        language_code: 'es',
        cefr_level: 'A1',
        source: 'ai_generated',
        owner_id: userA.userId,
      })
      .select()
      .single();
    if (ai.error) throw new Error(`userA AI deck insert failed: ${ai.error.message}`);
    aiDeckId = ai.data.id;
  });

  afterAll(async () => {
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
    const service = getServiceClient();
    if (bundledDeckId) await service.from('decks').delete().eq('id', bundledDeckId);
  });

  it('user B cannot read user A profile', async () => {
    const { data, error } = await userB.client
      .from('profiles')
      .select('id, display_name')
      .eq('id', userA.userId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('both users can read bundled decks', async () => {
    const a = await userA.client.from('decks').select('id').eq('id', bundledDeckId);
    const b = await userB.client.from('decks').select('id').eq('id', bundledDeckId);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data ?? []).toHaveLength(1);
    expect(b.data ?? []).toHaveLength(1);
  });

  it('user B cannot read user A AI-generated deck', async () => {
    const { data, error } = await userB.client.from('decks').select('id').eq('id', aiDeckId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('user A can read their own AI-generated deck', async () => {
    const { data, error } = await userA.client.from('decks').select('id').eq('id', aiDeckId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it('user B cannot UPDATE user A profile.tier to escalate to pro', async () => {
    // RLS returns 0-rows-affected (success-but-no-effect) rather than an error
    // when the WHERE clause is filtered out by the policy.
    const before = await getServiceClient()
      .from('profiles')
      .select('tier')
      .eq('id', userA.userId)
      .single();
    expect(before.error).toBeNull();
    expect(before.data?.tier).toBe('free');

    await userB.client
      .from('profiles')
      .update({ tier: 'pro' })
      .eq('id', userA.userId);

    const after = await getServiceClient()
      .from('profiles')
      .select('tier')
      .eq('id', userA.userId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data?.tier).toBe('free');
  });

  it('user A cannot self-promote tier even on own row', async () => {
    await userA.client.from('profiles').update({ tier: 'pro' }).eq('id', userA.userId);

    const { data } = await getServiceClient()
      .from('profiles')
      .select('tier')
      .eq('id', userA.userId)
      .single();
    expect(data?.tier).toBe('free');
  });

  it('user A cannot self-promote is_admin', async () => {
    await userA.client.from('profiles').update({ is_admin: true }).eq('id', userA.userId);

    const { data } = await getServiceClient()
      .from('profiles')
      .select('is_admin')
      .eq('id', userA.userId)
      .single();
    expect(data?.is_admin).toBe(false);
  });

  it('user B cannot read user A reviews/attempts even if rows exist', async () => {
    // Seed a card under bundled deck (so userA can write a review).
    const service = getServiceClient();
    const card = await service
      .from('cards')
      .insert({
        deck_id: bundledDeckId,
        target_text: 'hola',
        native_text: 'hello',
        language_code: 'es',
      })
      .select()
      .single();
    expect(card.error).toBeNull();

    // userA inserts a review for that card.
    const reviewIns = await userA.client.from('reviews').insert({
      user_id: userA.userId,
      card_id: card.data!.id,
      ease: 2.5,
      interval_days: 1,
      due_at: new Date().toISOString(),
      fsrs_state: { algo: 'fsrs-stub' },
    });
    expect(reviewIns.error, `userA review insert: ${reviewIns.error?.message}`).toBeNull();

    // userB asks for that review. RLS hides it.
    const visible = await userB.client
      .from('reviews')
      .select('id')
      .eq('card_id', card.data!.id);
    expect(visible.error).toBeNull();
    expect(visible.data ?? []).toHaveLength(0);
  });

  it('soft-deleted decks are not visible via SELECT', async () => {
    const service = getServiceClient();
    // Create another AI deck for userA, then soft-delete it as service role.
    const ai = await userA.client
      .from('decks')
      .insert({
        name: 'rls-test soft-delete',
        language_code: 'es',
        cefr_level: 'A1',
        source: 'ai_generated',
        owner_id: userA.userId,
      })
      .select()
      .single();
    expect(ai.error).toBeNull();

    await service
      .from('decks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ai.data!.id);

    const visible = await userA.client.from('decks').select('id').eq('id', ai.data!.id);
    expect(visible.error).toBeNull();
    expect(visible.data ?? []).toHaveLength(0);
  });
});
