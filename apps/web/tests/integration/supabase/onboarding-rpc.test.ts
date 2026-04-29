import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('complete_onboarding RPC', () => {
  let user: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    user = await createTestUser('onboarding');
  });

  afterAll(async () => {
    if (user?.userId) await deleteTestUser(user.userId);
  });

  it('rejects an empty display_name', async () => {
    const { error } = await user.client.rpc('complete_onboarding', {
      p_display_name: '   ',
      p_native_language_code: 'en-US',
      p_targets: [{ language_code: 'es', cefr_level: 'A1' }],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/display_name is required/i);
  });

  it('rejects an empty targets array', async () => {
    const { error } = await user.client.rpc('complete_onboarding', {
      p_display_name: 'Ben',
      p_native_language_code: 'en-US',
      p_targets: [],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/at least one target language/i);
  });

  it('rejects an unsupported CEFR level', async () => {
    const { error } = await user.client.rpc('complete_onboarding', {
      p_display_name: 'Ben',
      p_native_language_code: 'en-US',
      p_targets: [{ language_code: 'es', cefr_level: 'NOPE' }],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/CEFR level/i);
  });

  it('writes display_name + native_language_code + user_languages atomically on success', async () => {
    const { error: rpcError } = await user.client.rpc('complete_onboarding', {
      p_display_name: 'Ben',
      p_native_language_code: 'en-US',
      p_targets: [
        { language_code: 'es', cefr_level: 'A1' },
        { language_code: 'fr', cefr_level: 'B1' },
      ],
    });
    expect(rpcError).toBeNull();

    const profile = await getServiceClient()
      .from('profiles')
      .select('display_name, native_language_code')
      .eq('id', user.userId)
      .single();
    expect(profile.error).toBeNull();
    expect(profile.data).toMatchObject({ display_name: 'Ben', native_language_code: 'en-US' });

    const userLangs = await getServiceClient()
      .from('user_languages')
      .select('language_code, cefr_level')
      .eq('user_id', user.userId);
    expect(userLangs.error).toBeNull();
    const sorted = (userLangs.data ?? []).sort((a, b) => a.language_code.localeCompare(b.language_code));
    expect(sorted).toEqual([
      { language_code: 'es', cefr_level: 'A1' },
      { language_code: 'fr', cefr_level: 'B1' },
    ]);
  });

  it('is idempotent: calling again upserts cefr_level on existing rows', async () => {
    const { error } = await user.client.rpc('complete_onboarding', {
      p_display_name: 'Ben',
      p_native_language_code: 'en-US',
      p_targets: [
        { language_code: 'es', cefr_level: 'B2' }, // bumped from A1
      ],
    });
    expect(error).toBeNull();

    const userLangs = await getServiceClient()
      .from('user_languages')
      .select('language_code, cefr_level')
      .eq('user_id', user.userId);
    const es = (userLangs.data ?? []).find((l) => l.language_code === 'es');
    expect(es?.cefr_level).toBe('B2');
  });
});
