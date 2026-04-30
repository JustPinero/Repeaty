import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

const BUCKET = 'pronunciation-audio';

describe('pronunciation-audio bucket — path-prefix RLS', () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    userA = await createTestUser('storage-A');
    userB = await createTestUser('storage-B');
  });

  afterAll(async () => {
    // Best-effort cleanup of any objects we managed to upload.
    const service = getServiceClient();
    const stale = await service.storage.from(BUCKET).list(userA?.userId ?? '');
    if (stale.data) {
      const paths = stale.data.map((o) => `${userA.userId}/${o.name}`);
      if (paths.length > 0) await service.storage.from(BUCKET).remove(paths);
    }
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  it('the bucket exists and is private', async () => {
    const service = getServiceClient();
    // storage.getBucket reads from storage.buckets.
    const { data, error } = await service.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data?.id).toBe(BUCKET);
    expect(data?.public).toBe(false);
  });

  it('user A can upload under their own prefix', async () => {
    const path = `${userA.userId}/test-${Date.now()}.webm`;
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const { error } = await userA.client.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'audio/webm' });
    expect(error).toBeNull();
  });

  it("user A cannot upload under user B's prefix (path-prefix policy)", async () => {
    const path = `${userB.userId}/cross-tenant-${Date.now()}.webm`;
    const blob = new Blob([new Uint8Array([5, 6, 7, 8])], { type: 'audio/webm' });
    const { error } = await userA.client.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'audio/webm' });
    expect(error).not.toBeNull();
  });

  it("user B cannot list user A's prefix", async () => {
    // Seed an object owned by A first (via service role to bypass any test ordering).
    const service = getServiceClient();
    const seedPath = `${userA.userId}/seeded-${Date.now()}.webm`;
    await service.storage
      .from(BUCKET)
      .upload(seedPath, new Blob([new Uint8Array([9])], { type: 'audio/webm' }), {
        contentType: 'audio/webm',
      });

    const { data, error } = await userB.client.storage.from(BUCKET).list(userA.userId);
    // The list call itself should succeed (returning an empty list filtered by RLS)
    // OR fail with a not-found / forbidden — either way, B never sees A's object.
    if (error) {
      // Acceptable: explicit denial.
      expect(error).not.toBeNull();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("user B cannot download user A's object", async () => {
    const service = getServiceClient();
    const seedPath = `${userA.userId}/download-block-${Date.now()}.webm`;
    await service.storage
      .from(BUCKET)
      .upload(seedPath, new Blob([new Uint8Array([10, 11])], { type: 'audio/webm' }), {
        contentType: 'audio/webm',
      });

    const { data, error } = await userB.client.storage.from(BUCKET).download(seedPath);
    // Either the download errors, or it resolves with no data.
    expect(error || !data).toBeTruthy();
  });
});
