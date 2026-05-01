import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  type TestUser,
} from './_helpers';

describe('bump_rate_limit_decrement RPC', () => {
  let user: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    user = await createTestUser('decrement');
  });

  afterAll(async () => {
    if (user?.userId) await deleteTestUser(user.userId);
  });

  it('decrements after a bump', async () => {
    const bump = await user.client.rpc('bump_rate_limit', {
      p_bucket: 'feedback_generation',
      p_cap_per_day: 10,
    });
    expect(bump.data).toBe(1);

    const dec = await user.client.rpc('bump_rate_limit_decrement', {
      p_bucket: 'feedback_generation',
    });
    expect(dec.error).toBeNull();
    expect(dec.data).toBe(0);
  });

  it('clamps at 0 — multiple decrements past zero are safe', async () => {
    // Drain to 0.
    await user.client.rpc('bump_rate_limit_decrement', { p_bucket: 'feedback_generation' });
    await user.client.rpc('bump_rate_limit_decrement', { p_bucket: 'feedback_generation' });
    const dec = await user.client.rpc('bump_rate_limit_decrement', {
      p_bucket: 'feedback_generation',
    });
    expect(dec.error).toBeNull();
    expect(dec.data).toBe(0);
  });

  it('no-op when no row exists for the day', async () => {
    const dec = await user.client.rpc('bump_rate_limit_decrement', {
      p_bucket: 'never_used_bucket',
    });
    expect(dec.error).toBeNull();
    expect(dec.data).toBe(0);
  });
});
