import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('client_error_log RLS', () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    userA = await createTestUser('cel-A');
    userB = await createTestUser('cel-B');
  });

  afterAll(async () => {
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  it('table exists and RLS is enabled', async () => {
    const { data, error } = await getServiceClient()
      .rpc('_test_relrowsecurity', { p_table: 'client_error_log' });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('user A can insert a row for themselves', async () => {
    const { data, error } = await userA.client
      .from('client_error_log')
      .insert({
        user_id: userA.userId,
        message: 'Test error from user A',
        stack: 'Error\n  at <anonymous>:1:1',
        route: '/app',
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(userA.userId);
  });

  it("user A cannot insert a row claiming user B's id", async () => {
    const { error } = await userA.client.from('client_error_log').insert({
      user_id: userB.userId,
      message: 'Forged error',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('user A cannot SELECT their own rows via RLS (no general SELECT policy — service-role only)', async () => {
    const { data, error } = await userA.client
      .from('client_error_log')
      .select('*')
      .limit(10);
    // No SELECT policy → empty result, not an error.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('service-role can read every row (admin triage path)', async () => {
    const { data, error } = await getServiceClient()
      .from('client_error_log')
      .select('id')
      .eq('user_id', userA.userId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('user_id defaults to auth.uid() when omitted', async () => {
    const { data, error } = await userB.client
      .from('client_error_log')
      .insert({ message: 'Default user_id check' })
      .select('user_id')
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(userB.userId);
  });
});
