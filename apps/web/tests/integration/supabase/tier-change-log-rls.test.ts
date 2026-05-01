import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('tier_change_log — RLS', () => {
  let admin: TestUser;
  let regular: TestUser;
  let target: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    admin = await createTestUser('tcl-admin');
    regular = await createTestUser('tcl-regular');
    target = await createTestUser('tcl-target');

    const service = getServiceClient();
    await service.from('profiles').update({ is_admin: true }).eq('id', admin.userId);

    await service.from('tier_change_log').insert({
      actor_id: admin.userId,
      target_id: target.userId,
      from_tier: 'free',
      to_tier: 'pro',
      reason: 'beta access',
    });
  });

  afterAll(async () => {
    if (admin?.userId) await deleteTestUser(admin.userId);
    if (regular?.userId) await deleteTestUser(regular.userId);
    if (target?.userId) await deleteTestUser(target.userId);
  });

  it('admin can SELECT all tier_change_log rows', async () => {
    const read = await admin.client
      .from('tier_change_log')
      .select('actor_id, target_id, from_tier, to_tier');
    expect(read.error).toBeNull();
    expect((read.data ?? []).length).toBeGreaterThan(0);
  });

  it('non-admin cannot SELECT tier_change_log rows', async () => {
    const read = await regular.client.from('tier_change_log').select('actor_id');
    expect(read.error).toBeNull();
    expect((read.data ?? []).length).toBe(0);
  });

  it('non-admin direct INSERT is blocked', async () => {
    const ins = await regular.client.from('tier_change_log').insert({
      actor_id: regular.userId,
      target_id: target.userId,
      from_tier: 'free',
      to_tier: 'admin',
      reason: 'self promotion',
    });
    expect(ins.error).not.toBeNull();
  });

  it('admin direct INSERT is also blocked (writes via service-role only)', async () => {
    const ins = await admin.client.from('tier_change_log').insert({
      actor_id: admin.userId,
      target_id: target.userId,
      from_tier: 'free',
      to_tier: 'pro',
      reason: 'direct admin attempt',
    });
    expect(ins.error).not.toBeNull();
  });
});
