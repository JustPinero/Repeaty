import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

const BUCKET = 'pronunciation-audio';
const OLD_AGE_INTERVAL = "interval '8 days'";

describe('purge_free_tier_audio()', () => {
  let freeUser: TestUser;
  let proUser: TestUser;
  let bundledCardId: string;
  const uploaded: Array<{ path: string }> = [];

  beforeAll(async () => {
    ensureIntegrationEnv();
    freeUser = await createTestUser('retention-free');
    proUser = await createTestUser('retention-pro');

    const service = getServiceClient();
    const cards = await service.from('cards').select('id').eq('language_code', 'es').limit(1);
    bundledCardId = cards.data![0]!.id;

    // Promote proUser to tier='pro' via service role.
    const { error: upErr } = await service
      .from('profiles')
      .update({ tier: 'pro' })
      .eq('id', proUser.userId);
    expect(upErr).toBeNull();
  });

  afterAll(async () => {
    const service = getServiceClient();
    if (uploaded.length > 0) {
      await service.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
    }
    if (freeUser?.userId) await deleteTestUser(freeUser.userId);
    if (proUser?.userId) await deleteTestUser(proUser.userId);
  });

  async function seedOldAttempt(userId: string) {
    const service = getServiceClient();
    const filename = `seed-${Date.now()}-${Math.random().toString(36).slice(2)}.webm`;
    const path = `${userId}/${bundledCardId}/${filename}`;
    const upload = await service.storage
      .from(BUCKET)
      .upload(path, new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }), {
        contentType: 'audio/webm',
      });
    expect(upload.error).toBeNull();
    uploaded.push({ path });

    const insert = await service
      .from('pronunciation_attempts')
      .insert({
        user_id: userId,
        card_id: bundledCardId,
        audio_storage_path: path,
        whisper_transcript: 'hola',
        similarity_score: 0.9,
      })
      .select('id')
      .single();
    expect(insert.error).toBeNull();
    const attemptId = insert.data!.id as string;

    // Backdate created_at so the row is "older than 7 days" for the purge.
    const back = await service.rpc('test_force_attempt_age', {
      p_attempt_id: attemptId,
      p_age: OLD_AGE_INTERVAL,
    });
    expect(back.error).toBeNull();

    return { attemptId, path };
  }

  it('reaps audio for free-tier users older than 7 days; preserves Pro-tier audio', async () => {
    const free = await seedOldAttempt(freeUser.userId);
    const pro = await seedOldAttempt(proUser.userId);

    const service = getServiceClient();
    const purge = await service.rpc('purge_free_tier_audio');
    expect(purge.error).toBeNull();

    // Free-tier row: audio_storage_path NULLed.
    const freeRow = await service
      .from('pronunciation_attempts')
      .select('audio_storage_path')
      .eq('id', free.attemptId)
      .single();
    expect(freeRow.data?.audio_storage_path).toBeNull();

    // Free-tier file: gone from storage.
    const freeListing = await service.storage.from(BUCKET).list(freeUser.userId);
    expect(freeListing.error).toBeNull();
    const freeNames = (freeListing.data ?? []).map((o) => o.name);
    expect(freeNames.find((n) => free.path.endsWith(n))).toBeUndefined();

    // Pro-tier row: untouched.
    const proRow = await service
      .from('pronunciation_attempts')
      .select('audio_storage_path')
      .eq('id', pro.attemptId)
      .single();
    expect(proRow.data?.audio_storage_path).toBe(pro.path);
  });

  it('is idempotent — running twice produces the same outcome', async () => {
    const service = getServiceClient();
    const first = await service.rpc('purge_free_tier_audio');
    expect(first.error).toBeNull();
    const second = await service.rpc('purge_free_tier_audio');
    expect(second.error).toBeNull();

    // No audio for free-tier users should remain in storage.
    const listing = await service.storage.from(BUCKET).list(freeUser.userId);
    expect(listing.error).toBeNull();
    expect((listing.data ?? []).length).toBe(0);
  });
});
