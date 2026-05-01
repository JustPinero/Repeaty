import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('rate_limits — RLS', () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    userA = await createTestUser('rl-A');
    userB = await createTestUser('rl-B');
  });

  afterAll(async () => {
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  it('user A can SELECT their own rate_limits row', async () => {
    const service = getServiceClient();
    const seed = await service.from('rate_limits').insert({
      user_id: userA.userId,
      bucket: 'lesson_generation',
      day: new Date().toISOString().slice(0, 10),
      count: 3,
    });
    expect(seed.error).toBeNull();

    const read = await userA.client
      .from('rate_limits')
      .select('count')
      .eq('user_id', userA.userId);
    expect(read.error).toBeNull();
    expect(read.data ?? []).toHaveLength(1);
    expect(read.data?.[0]?.count).toBe(3);
  });

  it("user B cannot read user A's rate_limits", async () => {
    const read = await userB.client
      .from('rate_limits')
      .select('count')
      .eq('user_id', userA.userId);
    expect(read.error).toBeNull();
    expect(read.data ?? []).toHaveLength(0);
  });

  it('authenticated direct INSERT is blocked (no INSERT policy)', async () => {
    const ins = await userA.client.from('rate_limits').insert({
      user_id: userA.userId,
      bucket: 'feedback_generation',
      day: new Date().toISOString().slice(0, 10),
      count: 1,
    });
    expect(ins.error).not.toBeNull();
  });

  it('authenticated direct UPDATE is blocked (no UPDATE policy)', async () => {
    const upd = await userA.client
      .from('rate_limits')
      .update({ count: 99 })
      .eq('user_id', userA.userId);
    expect(upd.error || (upd.data ?? []).length === 0).toBeTruthy();
  });
});
