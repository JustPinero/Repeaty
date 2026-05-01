import { supabase } from '@/lib/supabase';

/** 10 MB. ~30s of opus at 64 kbps fits comfortably; longer than that means
 * something has gone wrong (or the user is reciting Tolstoy). */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const BUCKET = 'pronunciation-audio';

const EXT_BY_TYPE: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

function pickExtension(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return EXT_BY_TYPE[base] ?? EXT_BY_TYPE[mimeType.toLowerCase()] ?? 'bin';
}

export type UploadOptions = {
  userId: string;
  cardId: string;
};

/**
 * Upload a recorded audio blob to the `pronunciation-audio` bucket. Returns
 * the storage path on success. Caller passes the path to
 * `score-pronunciation` (4.4) so the Edge Function can re-download for
 * Whisper.
 *
 * Path: `${userId}/${cardId}/<uuidv4>.<ext>` — the leading `${userId}` is
 * what the bucket's path-prefix RLS policy enforces.
 */
export async function uploadPronunciationBlob(
  blob: Blob,
  { userId, cardId }: UploadOptions,
): Promise<string> {
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `Audio blob too large: ${blob.size} bytes (cap ${MAX_AUDIO_BYTES})`,
    );
  }

  const ext = pickExtension(blob.type);
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `${userId}/${cardId}/${filename}`;
  const contentType = blob.type || 'application/octet-stream';

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: false });

  if (error) {
    throw new Error(`Pronunciation upload failed: ${error.message}`);
  }

  return path;
}
