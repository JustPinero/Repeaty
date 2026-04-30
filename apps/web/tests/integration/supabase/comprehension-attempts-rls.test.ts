import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('comprehension_attempts RLS', () => {
  let userA: TestUser;
  let userB: TestUser;
  let bundledCardId: string;

  beforeAll(async () => {
    ensureIntegrationEnv();
    userA = await createTestUser('comp-A');
    userB = await createTestUser('comp-B');
    // Pick any bundled card for the inserts.
    const cards = await getServiceClient()
      .from('cards')
      .select('id')
      .eq('language_code', 'es')
      .limit(1);
    bundledCardId = cards.data![0]!.id;
  });

  afterAll(async () => {
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  it('user A can insert their own attempt', async () => {
    const { error } = await userA.client.from('comprehension_attempts').insert({
      user_id: userA.userId,
      card_id: bundledCardId,
      response_ms: 1500,
      correct: true,
    });
    expect(error).toBeNull();
  });

  it("user A cannot insert an attempt with someone else's user_id (WITH CHECK fails)", async () => {
    const { error } = await userA.client.from('comprehension_attempts').insert({
      user_id: userB.userId,
      card_id: bundledCardId,
      response_ms: 1500,
      correct: true,
    });
    expect(error).not.toBeNull();
  });

  it('user B cannot read user A’s attempts (RLS-filtered)', async () => {
    // Service role inserts a row owned by A.
    const ins = await getServiceClient().from('comprehension_attempts').insert({
      user_id: userA.userId,
      card_id: bundledCardId,
      response_ms: 2000,
      correct: false,
    });
    expect(ins.error).toBeNull();

    const { data, error } = await userB.client
      .from('comprehension_attempts')
      .select('id')
      .eq('user_id', userA.userId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
