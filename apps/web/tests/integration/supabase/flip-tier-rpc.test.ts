import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('flip_tier RPC', () => {
  let admin: TestUser;
  let regular: TestUser;
  let target: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    admin = await createTestUser('flip-admin');
    regular = await createTestUser('flip-regular');
    target = await createTestUser('flip-target');
    await getServiceClient()
      .from('profiles')
      .update({ is_admin: true })
      .eq('id', admin.userId);
  });

  afterAll(async () => {
    if (admin?.userId) await deleteTestUser(admin.userId);
    if (regular?.userId) await deleteTestUser(regular.userId);
    if (target?.userId) await deleteTestUser(target.userId);
  });

  it('admin can flip target free → pro and inserts a tier_change_log row', async () => {
    const flip = await admin.client.rpc('flip_tier', {
      p_target_id: target.userId,
      p_new_tier: 'pro',
      p_reason: 'beta access',
    });
    expect(flip.error).toBeNull();
    expect(typeof flip.data).toBe('string');

    const profile = await getServiceClient()
      .from('profiles')
      .select('tier')
      .eq('id', target.userId)
      .single();
    expect(profile.data?.tier).toBe('pro');

    const log = await getServiceClient()
      .from('tier_change_log')
      .select('actor_id, target_id, from_tier, to_tier, reason')
      .eq('id', flip.data!)
      .single();
    expect(log.data?.actor_id).toBe(admin.userId);
    expect(log.data?.target_id).toBe(target.userId);
    expect(log.data?.from_tier).toBe('free');
    expect(log.data?.to_tier).toBe('pro');
    expect(log.data?.reason).toBe('beta access');
  });

  it('non-admin caller is rejected with NOT_ADMIN', async () => {
    const flip = await regular.client.rpc('flip_tier', {
      p_target_id: target.userId,
      p_new_tier: 'free',
    });
    expect(flip.error).not.toBeNull();
    expect(flip.error?.message).toMatch(/NOT_ADMIN/);
  });

  it('admin cannot flip their own tier (SELF_FLIP_FORBIDDEN)', async () => {
    const flip = await admin.client.rpc('flip_tier', {
      p_target_id: admin.userId,
      p_new_tier: 'free',
    });
    expect(flip.error).not.toBeNull();
    expect(flip.error?.message).toMatch(/SELF_FLIP_FORBIDDEN/);
  });

  it('rejects invalid tiers', async () => {
    const flip = await admin.client.rpc('flip_tier', {
      p_target_id: target.userId,
      p_new_tier: 'super_pro',
    });
    expect(flip.error).not.toBeNull();
    expect(flip.error?.message).toMatch(/INVALID_TIER/);
  });

  it('rejects no-op flips with NO_CHANGE', async () => {
    // Target is currently 'pro' from the first test.
    const flip = await admin.client.rpc('flip_tier', {
      p_target_id: target.userId,
      p_new_tier: 'pro',
    });
    expect(flip.error).not.toBeNull();
    expect(flip.error?.message).toMatch(/NO_CHANGE/);
  });
});
