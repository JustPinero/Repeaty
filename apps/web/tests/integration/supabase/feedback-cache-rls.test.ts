import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('feedback_cache — RLS', () => {
  let userA: TestUser;
  let bundledCardId: string;

  beforeAll(async () => {
    ensureIntegrationEnv();
    userA = await createTestUser('fc-A');
    const cards = await getServiceClient()
      .from('cards')
      .select('id')
      .eq('language_code', 'es')
      .limit(1);
    bundledCardId = cards.data![0]!.id;
  });

  afterAll(async () => {
    if (userA?.userId) await deleteTestUser(userA.userId);
  });

  it('any authenticated user can SELECT cached feedback', async () => {
    const service = getServiceClient();
    const seed = await service.from('feedback_cache').insert({
      card_id: bundledCardId,
      error_pattern: 'test-pattern',
      native_language_code: 'en',
      feedback_text: 'Try emphasising the second syllable.',
    });
    expect(seed.error).toBeNull();

    const read = await userA.client
      .from('feedback_cache')
      .select('feedback_text')
      .eq('card_id', bundledCardId)
      .eq('error_pattern', 'test-pattern')
      .eq('native_language_code', 'en')
      .single();
    expect(read.error).toBeNull();
    expect(read.data?.feedback_text).toMatch(/emphasising/);
  });

  it('authenticated direct INSERT is blocked', async () => {
    const ins = await userA.client.from('feedback_cache').insert({
      card_id: bundledCardId,
      error_pattern: 'forbidden',
      native_language_code: 'en',
      feedback_text: 'should not write',
    });
    expect(ins.error).not.toBeNull();
  });

  it('UNIQUE (card_id, error_pattern, native_language_code) is enforced', async () => {
    const service = getServiceClient();
    const ins = await service.from('feedback_cache').insert({
      card_id: bundledCardId,
      error_pattern: 'test-pattern',
      native_language_code: 'en',
      feedback_text: 'duplicate row',
    });
    expect(ins.error).not.toBeNull();
    expect(ins.error?.code).toBe('23505');
  });
});
