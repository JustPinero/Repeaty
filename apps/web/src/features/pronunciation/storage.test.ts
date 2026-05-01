import { describe, expect, it, vi, beforeEach } from 'vitest';

const uploadMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (path: string, blob: Blob, opts: unknown) => uploadMock(path, blob, opts),
      }),
    },
  },
}));

import { uploadPronunciationBlob, MAX_AUDIO_BYTES } from './storage';

const FAKE_USER_ID = '00000000-0000-0000-0000-0000000000aa';
const FAKE_CARD_ID = '00000000-0000-0000-0000-0000000000bb';

describe('uploadPronunciationBlob', () => {
  beforeEach(() => {
    uploadMock.mockReset();
    uploadMock.mockResolvedValue({ data: { path: 'ignored' }, error: null });
  });

  it('uploads to ${userId}/${cardId}/<uuid>.<ext> and returns the path', async () => {
    const blob = new Blob(['hi'], { type: 'audio/webm' });
    const path = await uploadPronunciationBlob(blob, {
      userId: FAKE_USER_ID,
      cardId: FAKE_CARD_ID,
    });
    expect(path).toMatch(
      new RegExp(`^${FAKE_USER_ID}/${FAKE_CARD_ID}/[0-9a-f-]+\\.webm$`),
    );
    expect(uploadMock).toHaveBeenCalledWith(
      path,
      blob,
      expect.objectContaining({ contentType: 'audio/webm' }),
    );
  });

  it('uses .mp4 when the blob type is audio/mp4 (iOS Safari)', async () => {
    const blob = new Blob(['hi'], { type: 'audio/mp4' });
    const path = await uploadPronunciationBlob(blob, {
      userId: FAKE_USER_ID,
      cardId: FAKE_CARD_ID,
    });
    expect(path.endsWith('.mp4')).toBe(true);
    expect(uploadMock).toHaveBeenCalledWith(
      path,
      blob,
      expect.objectContaining({ contentType: 'audio/mp4' }),
    );
  });

  it('falls back to .bin when the blob type is unknown', async () => {
    const blob = new Blob(['hi'], { type: '' });
    const path = await uploadPronunciationBlob(blob, {
      userId: FAKE_USER_ID,
      cardId: FAKE_CARD_ID,
    });
    expect(path.endsWith('.bin')).toBe(true);
  });

  it('rejects blobs over the 10MB cap before calling supabase', async () => {
    const oversized = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)], {
      type: 'audio/webm',
    });
    await expect(
      uploadPronunciationBlob(oversized, { userId: FAKE_USER_ID, cardId: FAKE_CARD_ID }),
    ).rejects.toThrow(/too large/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('throws when supabase returns an error', async () => {
    uploadMock.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    const blob = new Blob(['hi'], { type: 'audio/webm' });
    await expect(
      uploadPronunciationBlob(blob, { userId: FAKE_USER_ID, cardId: FAKE_CARD_ID }),
    ).rejects.toThrow(/permission denied/);
  });
});
