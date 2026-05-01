import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('list_admin_profiles RPC', () => {
  let admin: TestUser;
  let regular1: TestUser;
  let regular2: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    admin = await createTestUser('lap-admin');
    regular1 = await createTestUser('lap-regular-1');
    regular2 = await createTestUser('lap-regular-2');

    await getServiceClient()
      .from('profiles')
      .update({ is_admin: true })
      .eq('id', admin.userId);
  });

  afterAll(async () => {
    if (admin?.userId) await deleteTestUser(admin.userId);
    if (regular1?.userId) await deleteTestUser(regular1.userId);
    if (regular2?.userId) await deleteTestUser(regular2.userId);
  });

  it('admin sees ≥ 3 profile rows (their own + the two non-admins)', async () => {
    const res = await admin.client.rpc('list_admin_profiles', { p_limit: 50 });
    expect(res.error).toBeNull();
    type Row = { id: string; tier: string; is_admin: boolean };
    const rows = (res.data ?? []) as Row[];
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(admin.userId);
    expect(ids).toContain(regular1.userId);
    expect(ids).toContain(regular2.userId);
  });

  it('non-admin caller raises NOT_ADMIN', async () => {
    const res = await regular1.client.rpc('list_admin_profiles', { p_limit: 50 });
    expect(res.error).not.toBeNull();
    expect(res.error?.message).toMatch(/NOT_ADMIN/);
  });

  it('rejects invalid p_limit', async () => {
    const res = await admin.client.rpc('list_admin_profiles', { p_limit: 0 });
    expect(res.error).not.toBeNull();
    expect(res.error?.message).toMatch(/INVALID_LIMIT/);
  });
});
