/**
 * Dexie-backed offline queues for the three session-write paths. Hooks
 * (`useReviewSession.submitRating`, `useComprehensionSession.submitResponse`)
 * detect offline and enqueue rather than failing; the replay loop drains the
 * queue on reconnect.
 *
 * v1 ships review + comprehension queueing. Pronunciation queueing requires
 * persisting the audio Blob to IndexedDB (Dexie supports it but the replay
 * state machine is meaningfully more complex — re-upload + re-invoke Edge
 * Function + re-handle 401/429/etc.). Tracked as DEBT-008.
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

class RepeatyOfflineDB extends Dexie {
  pending_reviews!: Table<QueuedReview, number>;
  pending_comprehension_attempts!: Table<QueuedComprehension, number>;

  constructor() {
    super('repeaty-offline');
    this.version(1).stores({
      pending_reviews: '++id, user_id, card_id, clientCreatedAt',
      pending_comprehension_attempts: '++id, user_id, card_id, clientCreatedAt',
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

export type QueueDepth = {
  pendingReviews: number;
  pendingComprehensionAttempts: number;
};

export async function queueDepth(): Promise<QueueDepth> {
  if (!canQueue()) return { pendingReviews: 0, pendingComprehensionAttempts: 0 };
  const db = getOfflineDb();
  const [r, c] = await Promise.all([
    db.pending_reviews.count(),
    db.pending_comprehension_attempts.count(),
  ]);
  return { pendingReviews: r, pendingComprehensionAttempts: c };
}

/** Replay handler — caller-provided so the hook layer can wire in the actual
 * supabase calls (insert / upsert + 401 handling) without coupling this
 * module to the supabase client. Returns `true` if the item flushed cleanly,
 * `false` to leave it in the queue for the next pass. */
export type ReplayReviewFn = (row: QueuedReview) => Promise<boolean>;
export type ReplayComprehensionFn = (row: QueuedComprehension) => Promise<boolean>;

const MAX_ATTEMPTS = 5;

export async function replayQueues(handlers: {
  replayReview: ReplayReviewFn;
  replayComprehension: ReplayComprehensionFn;
}): Promise<{ flushed: number; failed: number }> {
  if (!canQueue()) return { flushed: 0, failed: 0 };
  const db = getOfflineDb();
  let flushed = 0;
  let failed = 0;

  // Drain in chronological order (clientCreatedAt asc) per queue. Server-
  // ordering across the two queues isn't meaningful — they touch separate
  // tables.
  for (const queue of ['pending_reviews', 'pending_comprehension_attempts'] as const) {
    const items = await db
      .table(queue)
      .orderBy('clientCreatedAt')
      .toArray();
    for (const item of items as Array<QueuedReview | QueuedComprehension>) {
      const ok = await (queue === 'pending_reviews'
        ? handlers.replayReview(item as QueuedReview)
        : handlers.replayComprehension(item as QueuedComprehension));
      if (ok) {
        await db.table(queue).delete(item.id!);
        flushed += 1;
      } else if (item.attemptCount + 1 >= MAX_ATTEMPTS) {
        // Bad row that's failed too many times. Remove from queue rather
        // than let it block forever — log to console for inspection.
        // eslint-disable-next-line no-console
        console.warn('[offline-queue] dropping unreplayable row', queue, item);
        await db.table(queue).delete(item.id!);
        failed += 1;
      } else {
        await db
          .table(queue)
          .update(item.id!, { attemptCount: item.attemptCount + 1 });
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
  ]);
}
