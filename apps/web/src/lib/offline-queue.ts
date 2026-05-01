/**
 * Dexie-backed offline queues for the three session-write paths. Hooks
 * (`useReviewSession.submitRating`, `useComprehensionSession.submitResponse`,
 * `usePronunciationSession.submitRecording`) detect offline and enqueue
 * rather than failing; the replay loop drains the queue on reconnect.
 *
 * Pronunciation queueing (DEBT-008) carries the audio Blob in IndexedDB
 * + a two-stage replay state machine: the upload to Storage runs before
 * the score-pronunciation Edge Function call so a partial-flush (upload
 * succeeded, function failed) doesn't double-upload on retry — the
 * `uploaded_path` field is persisted between attempts.
 *
 * Conflict resolution: server wins. Each queued item carries its
 * `clientCreatedAt` so the replay loop can tell whether the local edit
 * predates a server-side change observed since.
 */

import Dexie, { type Table } from 'dexie';

export type QueuedReview = {
  id?: number;
  user_id: string;
  card_id: string;
  fsrs_state: unknown;
  ease: number;
  interval_days: number;
  due_at: string;
  last_reviewed_at: string;
  clientCreatedAt: number;
  attemptCount: number;
};

export type QueuedComprehension = {
  id?: number;
  user_id: string;
  card_id: string;
  response_ms: number;
  correct: boolean;
  clientCreatedAt: number;
  attemptCount: number;
};

export type QueuedPronunciation = {
  id?: number;
  user_id: string;
  card_id: string;
  /** The audio blob captured offline. Persisted in IndexedDB; replayed by
   * re-uploading via supabase.storage on reconnect. */
  audio_blob: Blob;
  /** Set once the Storage upload succeeds — prevents a retry from double-
   * uploading if the Edge Function call fails after the upload but before
   * the row drains. Empty string until the first successful upload. */
  uploaded_path: string;
  clientCreatedAt: number;
  attemptCount: number;
};

class RepeatyOfflineDB extends Dexie {
  pending_reviews!: Table<QueuedReview, number>;
  pending_comprehension_attempts!: Table<QueuedComprehension, number>;
  pending_pronunciation_attempts!: Table<QueuedPronunciation, number>;

  constructor() {
    super('repeaty-offline');
    // Version 1: review + comprehension only (Phase 6.4 baseline).
    this.version(1).stores({
      pending_reviews: '++id, user_id, card_id, clientCreatedAt',
      pending_comprehension_attempts: '++id, user_id, card_id, clientCreatedAt',
    });
    // Version 2: pronunciation queue lands (DEBT-008 activation). Existing
    // tables stay unchanged so v1-era IndexedDBs upgrade in place; the new
    // table is appended.
    this.version(2).stores({
      pending_reviews: '++id, user_id, card_id, clientCreatedAt',
      pending_comprehension_attempts: '++id, user_id, card_id, clientCreatedAt',
      pending_pronunciation_attempts: '++id, user_id, card_id, clientCreatedAt',
    });
  }
}

// Singleton instance. Created lazily so SSR / test environments without
// IndexedDB can still import this module without crashing.
let _db: RepeatyOfflineDB | null = null;
export function getOfflineDb(): RepeatyOfflineDB {
  if (!_db) _db = new RepeatyOfflineDB();
  return _db;
}

/** True iff the runtime supports IndexedDB. False under jsdom-without-fake. */
export function canQueue(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function enqueueReview(
  payload: Omit<QueuedReview, 'id' | 'clientCreatedAt' | 'attemptCount'>,
): Promise<void> {
  if (!canQueue()) return;
  await getOfflineDb().pending_reviews.add({
    ...payload,
    clientCreatedAt: Date.now(),
    attemptCount: 0,
  });
}

export async function enqueueComprehension(
  payload: Omit<QueuedComprehension, 'id' | 'clientCreatedAt' | 'attemptCount'>,
): Promise<void> {
  if (!canQueue()) return;
  await getOfflineDb().pending_comprehension_attempts.add({
    ...payload,
    clientCreatedAt: Date.now(),
    attemptCount: 0,
  });
}

export async function enqueuePronunciation(
  payload: Omit<
    QueuedPronunciation,
    'id' | 'clientCreatedAt' | 'attemptCount' | 'uploaded_path'
  >,
): Promise<void> {
  if (!canQueue()) return;
  await getOfflineDb().pending_pronunciation_attempts.add({
    ...payload,
    uploaded_path: '',
    clientCreatedAt: Date.now(),
    attemptCount: 0,
  });
}

export type QueueDepth = {
  pendingReviews: number;
  pendingComprehensionAttempts: number;
  pendingPronunciationAttempts: number;
};

export async function queueDepth(): Promise<QueueDepth> {
  if (!canQueue()) {
    return {
      pendingReviews: 0,
      pendingComprehensionAttempts: 0,
      pendingPronunciationAttempts: 0,
    };
  }
  const db = getOfflineDb();
  const [r, c, p] = await Promise.all([
    db.pending_reviews.count(),
    db.pending_comprehension_attempts.count(),
    db.pending_pronunciation_attempts.count(),
  ]);
  return {
    pendingReviews: r,
    pendingComprehensionAttempts: c,
    pendingPronunciationAttempts: p,
  };
}

/** Replay handler — caller-provided so the hook layer can wire in the actual
 * supabase calls (insert / upsert + 401 handling) without coupling this
 * module to the supabase client. Returns `true` if the item flushed cleanly,
 * `false` to leave it in the queue for the next pass. */
export type ReplayReviewFn = (row: QueuedReview) => Promise<boolean>;
export type ReplayComprehensionFn = (row: QueuedComprehension) => Promise<boolean>;
/** Pronunciation replay is two-staged. The handler is told whether the
 * upload has already succeeded (`row.uploaded_path` non-empty); on a fresh
 * row it should upload + invoke the Edge Function; on a partial row it
 * should skip the upload and only re-invoke. The handler returns either:
 *   - `{ ok: true }` — fully flushed, drop the row
 *   - `{ ok: false, uploaded_path }` — upload succeeded but call failed;
 *     persist the path so the next attempt skips re-upload
 *   - `{ ok: false }` — upload itself failed; bump attemptCount, retry */
export type PronunciationReplayResult =
  | { ok: true }
  | { ok: false; uploaded_path?: string };
export type ReplayPronunciationFn = (
  row: QueuedPronunciation,
) => Promise<PronunciationReplayResult>;

const MAX_ATTEMPTS = 5;

export async function replayQueues(handlers: {
  replayReview: ReplayReviewFn;
  replayComprehension: ReplayComprehensionFn;
  replayPronunciation?: ReplayPronunciationFn;
}): Promise<{ flushed: number; failed: number }> {
  if (!canQueue()) return { flushed: 0, failed: 0 };
  const db = getOfflineDb();
  let flushed = 0;
  let failed = 0;

  // Drain in chronological order (clientCreatedAt asc) per queue.
  for (const queue of [
    'pending_reviews',
    'pending_comprehension_attempts',
    'pending_pronunciation_attempts',
  ] as const) {
    const items = await db
      .table(queue)
      .orderBy('clientCreatedAt')
      .toArray();

    for (const item of items as Array<
      QueuedReview | QueuedComprehension | QueuedPronunciation
    >) {
      let result: PronunciationReplayResult;
      if (queue === 'pending_reviews') {
        const ok = await handlers.replayReview(item as QueuedReview);
        result = ok ? { ok: true } : { ok: false };
      } else if (queue === 'pending_comprehension_attempts') {
        const ok = await handlers.replayComprehension(item as QueuedComprehension);
        result = ok ? { ok: true } : { ok: false };
      } else if (handlers.replayPronunciation) {
        result = await handlers.replayPronunciation(item as QueuedPronunciation);
      } else {
        // No pronunciation handler bound (test scenarios) — leave the row.
        result = { ok: false };
      }

      if (result.ok) {
        await db.table(queue).delete(item.id!);
        flushed += 1;
        continue;
      }

      // Failure paths.
      // Persist the upload-checkpoint for pronunciation rows so the next
      // pass doesn't double-upload.
      const updates: Record<string, unknown> = {
        attemptCount: item.attemptCount + 1,
      };
      if (
        queue === 'pending_pronunciation_attempts' &&
        'uploaded_path' in result &&
        result.uploaded_path
      ) {
        updates.uploaded_path = result.uploaded_path;
      }

      if (item.attemptCount + 1 >= MAX_ATTEMPTS) {
        // eslint-disable-next-line no-console
        console.warn('[offline-queue] dropping unreplayable row', queue, item);
        await db.table(queue).delete(item.id!);
        failed += 1;
      } else {
        await db.table(queue).update(item.id!, updates);
        failed += 1;
      }
    }
  }
  return { flushed, failed };
}

/** Wipe all queues. Used by tests + the sign-out path. */
export async function clearOfflineQueues(): Promise<void> {
  if (!canQueue()) return;
  const db = getOfflineDb();
  await Promise.all([
    db.pending_reviews.clear(),
    db.pending_comprehension_attempts.clear(),
    db.pending_pronunciation_attempts.clear(),
  ]);
}
