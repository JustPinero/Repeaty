import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ensureIntegrationEnv, getServiceClient } from './_helpers';

describe('Supabase triggers', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    const service = getServiceClient();
    for (const id of createdUserIds) {
      await service.auth.admin.deleteUser(id);
    }
  });

  it('on_auth_user_created creates a matching profiles row', async () => {
    ensureIntegrationEnv();
    const service = getServiceClient();
    const email = `trigger-test-create-${randomUUID()}@example.com`;
    const created = await service.auth.admin.createUser({
      email,
      password: `pw-${randomUUID()}`,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;
    createdUserIds.push(userId);

    const { data, error } = await service
      .from('profiles')
      .select('id, email, tier, is_admin, display_name, native_language_code')
      .eq('id', userId)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: userId,
      email,
      tier: 'free',
      is_admin: false,
    });
    // Onboarding fields are NULL until Request 1.4's RPC fills them.
    expect(data?.display_name).toBeNull();
    expect(data?.native_language_code).toBeNull();
  });

  it('on_auth_user_email_changed mirrors the new email to profiles', async () => {
    const service = getServiceClient();
    const oldEmail = `trigger-test-oldmail-${randomUUID()}@example.com`;
    const newEmail = `trigger-test-newmail-${randomUUID()}@example.com`;
    const created = await service.auth.admin.createUser({
      email: oldEmail,
      password: `pw-${randomUUID()}`,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;
    createdUserIds.push(userId);

    const upd = await service.auth.admin.updateUserById(userId, { email: newEmail });
    expect(upd.error).toBeNull();

    const { data, error } = await service
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();
    expect(error).toBeNull();
    expect(data?.email).toBe(newEmail);
  });
});
