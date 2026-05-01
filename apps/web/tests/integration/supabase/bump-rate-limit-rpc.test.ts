import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  type TestUser,
} from './_helpers';

describe('bump_rate_limit RPC', () => {
  let user: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    user = await createTestUser('brl');
  });

  afterAll(async () => {
    if (user?.userId) await deleteTestUser(user.userId);
  });

  it('starts at 1 on the first call for a fresh user/bucket/day', async () => {
    const res = await user.client.rpc('bump_rate_limit', {
      p_bucket: 'lesson_generation',
      p_cap_per_day: 10,
    });
    expect(res.error).toBeNull();
    expect(res.data).toBe(1);
  });

  it('increments on subsequent calls', async () => {
    const a = await user.client.rpc('bump_rate_limit', {
      p_bucket: 'feedback_generation',
      p_cap_per_day: 10,
    });
    const b = await user.client.rpc('bump_rate_limit', {
      p_bucket: 'feedback_generation',
      p_cap_per_day: 10,
    });
    expect(a.data).toBe(1);
    expect(b.data).toBe(2);
  });

  it('raises P0001 RATE_LIMITED when count exceeds the per-day cap', async () => {
    // Use a fresh bucket-name unique to this test to avoid interference.
    const bucket = `feedback_generation_test_${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      const ok = await user.client.rpc('bump_rate_limit', {
        p_bucket: bucket,
        p_cap_per_day: 3,
      });
      expect(ok.error).toBeNull();
    }
    const fail = await user.client.rpc('bump_rate_limit', {
      p_bucket: bucket,
      p_cap_per_day: 3,
    });
    expect(fail.error).not.toBeNull();
    expect(fail.error?.message).toMatch(/RATE_LIMITED/);
  });

  it('different users on the same bucket/day count independently', async () => {
    const otherUser = await createTestUser('brl-other');
    try {
      const a = await user.client.rpc('bump_rate_limit', {
        p_bucket: 'lesson_generation_split',
        p_cap_per_day: 5,
      });
      const b = await otherUser.client.rpc('bump_rate_limit', {
        p_bucket: 'lesson_generation_split',
        p_cap_per_day: 5,
      });
      expect(a.data).toBe(1);
      expect(b.data).toBe(1);
    } finally {
      await deleteTestUser(otherUser.userId);
    }
  });
});
