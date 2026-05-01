import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import {
  canQueue,
  clearOfflineQueues,
  enqueueComprehension,
  enqueuePronunciation,
  enqueueReview,
  getOfflineDb,
  queueDepth,
  replayQueues,
} from './offline-queue';

describe('offline-queue', () => {
  beforeEach(async () => {
    await clearOfflineQueues();
  });

  it('canQueue returns true under fake-indexeddb', () => {
    expect(canQueue()).toBe(true);
  });

  it('enqueueReview persists a row + queueDepth reflects it', async () => {
    await enqueueReview({
      user_id: 'u-1',
      card_id: 'c-1',
      fsrs_state: { v: 1 },
      ease: 2.5,
      interval_days: 1,
      due_at: '2026-05-02T00:00:00Z',
      last_reviewed_at: '2026-05-01T00:00:00Z',
    });
    const depth = await queueDepth();
    expect(depth.pendingReviews).toBe(1);
    expect(depth.pendingComprehensionAttempts).toBe(0);
  });

  it('enqueueComprehension persists a row in the other queue', async () => {
    await enqueueComprehension({
      user_id: 'u-1',
      card_id: 'c-1',
      response_ms: 1500,
      correct: true,
    });
    const depth = await queueDepth();
    expect(depth.pendingReviews).toBe(0);
    expect(depth.pendingComprehensionAttempts).toBe(1);
  });

  it('review replay is upsert-last-wins (client overwrites unconditionally)', async () => {
    // Documents the v1 conflict-resolution contract: `useOfflineReplay` calls
    // `supabase.from('reviews').upsert(..., { onConflict: 'user_id,card_id' })`
    // and the queued row's `clientCreatedAt` is NOT compared against any
    // server-side `last_reviewed_at`. The handler simply receives the row
    // and acks. See references/repeaty-pwa.md § Offline queue.
    await enqueueReview({
      user_id: 'u-1',
      card_id: 'c-1',
      fsrs_state: { v: 1 },
      ease: 2.5,
      interval_days: 1,
      due_at: '2026-05-02T00:00:00Z',
      last_reviewed_at: '2026-05-01T00:00:00Z',
    });
    const handler = vi.fn().mockResolvedValue(true);
    const result = await replayQueues({
      replayReview: handler,
      replayComprehension: vi.fn().mockResolvedValue(true),
    });
    expect(result.flushed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('queued row exposes clientCreatedAt to the replay handler (forward-compat for compare-with-server.updated_at)', async () => {
    // The conflict-resolution drift fix-request promises a future "skip
    // upsert if server row is strictly newer than clientCreatedAt" rule.
    // For that to be implementable without a queue-format migration, the
    // handler must already receive `clientCreatedAt` on the row. Lock that
    // in with an explicit assertion.
    const before = Date.now();
    await enqueueReview({
      user_id: 'u-1',
      card_id: 'c-1',
      fsrs_state: { v: 1 },
      ease: 2.5,
      interval_days: 1,
      due_at: '2026-05-02T00:00:00Z',
      last_reviewed_at: '2026-05-01T00:00:00Z',
    });
    const after = Date.now();

    const handler = vi.fn().mockResolvedValue(true);
    await replayQueues({
      replayReview: handler,
      replayComprehension: vi.fn().mockResolvedValue(true),
    });
    expect(handler).toHaveBeenCalledTimes(1);
    const row = handler.mock.calls[0]![0];
    expect(typeof row.clientCreatedAt).toBe('number');
    expect(row.clientCreatedAt).toBeGreaterThanOrEqual(before);
    expect(row.clientCreatedAt).toBeLessThanOrEqual(after);
  });

  it('replayQueues flushes successful items and removes them from the queue', async () => {
    await enqueueReview({
      user_id: 'u-1',
      card_id: 'c-1',
      fsrs_state: { v: 1 },
      ease: 2.5,
      interval_days: 1,
      due_at: '2026-05-02T00:00:00Z',
      last_reviewed_at: '2026-05-01T00:00:00Z',
    });
    await enqueueComprehension({
      user_id: 'u-1',
      card_id: 'c-1',
      response_ms: 1500,
      correct: true,
    });

    const result = await replayQueues({
      replayReview: vi.fn().mockResolvedValue(true),
      replayComprehension: vi.fn().mockResolvedValue(true),
    });
    expect(result.flushed).toBe(2);
    expect(result.failed).toBe(0);
    const depth = await queueDepth();
    expect(depth.pendingReviews).toBe(0);
    expect(depth.pendingComprehensionAttempts).toBe(0);
  });

  it('replay leaves transient-fail items in the queue + bumps attemptCount', async () => {
    await enqueueComprehension({
      user_id: 'u-1',
      card_id: 'c-1',
      response_ms: 1500,
      correct: true,
    });
    const result = await replayQueues({
      replayReview: vi.fn().mockResolvedValue(true),
      replayComprehension: vi.fn().mockResolvedValue(false),
    });
    expect(result.flushed).toBe(0);
    expect(result.failed).toBe(1);
    const depth = await queueDepth();
    expect(depth.pendingComprehensionAttempts).toBe(1);
  });

  it('replay drops items after 5 failed attempts (poison pill defense)', async () => {
    await enqueueComprehension({
      user_id: 'u-1',
      card_id: 'c-1',
      response_ms: 1500,
      correct: true,
    });
    const handler = vi.fn().mockResolvedValue(false);
    // Five rounds of failure → item should be dropped on the 5th.
    for (let i = 0; i < 5; i++) {
      await replayQueues({
        replayReview: vi.fn().mockResolvedValue(true),
        replayComprehension: handler,
      });
    }
    const depth = await queueDepth();
    expect(depth.pendingComprehensionAttempts).toBe(0);
  });

  it('replay processes items in chronological order (clientCreatedAt asc)', async () => {
    await enqueueComprehension({
      user_id: 'u-1',
      card_id: 'c-A',
      response_ms: 1500,
      correct: true,
    });
    // Real-timer 5ms gap so clientCreatedAt strictly diverges. Fake timers
    // hang Dexie's internal microtask queue.
    await new Promise((r) => setTimeout(r, 5));
    await enqueueComprehension({
      user_id: 'u-1',
      card_id: 'c-B',
      response_ms: 2000,
      correct: false,
    });

    const order: string[] = [];
    await replayQueues({
      replayReview: vi.fn().mockResolvedValue(true),
      replayComprehension: vi.fn(async (row) => {
        order.push(row.card_id);
        return true;
      }),
    });
    expect(order).toEqual(['c-A', 'c-B']);
  });

  it('cursor-based drain picks up rows enqueued mid-handler in the same pass', async () => {
    // Snapshot semantics (the old `.toArray()` impl) would NOT see the
    // mid-handler insert until the next drain. The new `.each(...)` cursor
    // re-reads the index, so a row added during iteration with an *older*
    // `clientCreatedAt` than the in-progress row lands in the same pass.
    await enqueueComprehension({
      user_id: 'u-1',
      card_id: 'c-A',
      response_ms: 1500,
      correct: true,
    });

    const order: string[] = [];
    let injected = false;
    const handler = vi.fn(async (row) => {
      order.push(row.card_id);
      if (!injected) {
        injected = true;
        // Slow handler simulates real network latency. While we sleep, add
        // a 2nd row whose clientCreatedAt is OLDER than the row we just
        // received (clock skew across tabs is the production analogue).
        await new Promise((r) => setTimeout(r, 30));
        await getOfflineDb().pending_comprehension_attempts.add({
          user_id: 'u-1',
          card_id: 'c-B',
          response_ms: 2000,
          correct: false,
          clientCreatedAt: Date.now() - 1000,
          attemptCount: 0,
        });
      }
      return true;
    });

    await replayQueues({
      replayReview: vi.fn().mockResolvedValue(true),
      replayComprehension: handler,
    });

    // Both rows drained in the same replayQueues call; cursor caught the
    // mid-handler insert.
    expect(order).toContain('c-A');
    expect(order).toContain('c-B');
    expect(order).toHaveLength(2);
    const depth = await queueDepth();
    expect(depth.pendingComprehensionAttempts).toBe(0);
  });

  // ── Pronunciation queue (DEBT-008) ─────────────────────────────────────

  it('enqueuePronunciation persists the audio Blob with empty uploaded_path', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    await enqueuePronunciation({
      user_id: 'u-1',
      card_id: 'c-1',
      audio_blob: blob,
    });
    const depth = await queueDepth();
    expect(depth.pendingPronunciationAttempts).toBe(1);

    const rows = await getOfflineDb().pending_pronunciation_attempts.toArray();
    expect(rows[0]?.uploaded_path).toBe('');
    expect(rows[0]?.attemptCount).toBe(0);
    // fake-indexeddb's structured-clone implementation doesn't preserve the
    // Blob prototype reliably; in production (real IndexedDB) it does. The
    // contract we care about for tests: the field is present + non-null.
    expect(rows[0]?.audio_blob).toBeDefined();
  });

  it('replayPronunciation { ok: true } drains the row', async () => {
    await enqueuePronunciation({
      user_id: 'u-1',
      card_id: 'c-1',
      audio_blob: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
    });
    const result = await replayQueues({
      replayReview: vi.fn().mockResolvedValue(true),
      replayComprehension: vi.fn().mockResolvedValue(true),
      replayPronunciation: vi.fn().mockResolvedValue({ ok: true }),
    });
    expect(result.flushed).toBe(1);
    const depth = await queueDepth();
    expect(depth.pendingPronunciationAttempts).toBe(0);
  });

  it('replayPronunciation { ok: false, uploaded_path } persists the path so the next attempt skips re-upload', async () => {
    await enqueuePronunciation({
      user_id: 'u-1',
      card_id: 'c-1',
      audio_blob: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
    });

    const replayPronunciation = vi
      .fn()
      // Pass 1: upload OK, function call fails. Persist the uploaded path.
      .mockResolvedValueOnce({ ok: false, uploaded_path: 'u-1/c-1/abc.webm' })
      // Pass 2: handler should see uploaded_path is non-empty and skip the
      // re-upload step. Returns ok: true.
      .mockResolvedValueOnce({ ok: true });

    await replayQueues({
      replayReview: vi.fn().mockResolvedValue(true),
      replayComprehension: vi.fn().mockResolvedValue(true),
      replayPronunciation,
    });

    // Row still in queue with uploaded_path now set + attemptCount 1.
    const after = await getOfflineDb().pending_pronunciation_attempts.toArray();
    expect(after).toHaveLength(1);
    expect(after[0]?.uploaded_path).toBe('u-1/c-1/abc.webm');
    expect(after[0]?.attemptCount).toBe(1);

    // Second pass — verify the handler is invoked with the persisted path.
    await replayQueues({
      replayReview: vi.fn().mockResolvedValue(true),
      replayComprehension: vi.fn().mockResolvedValue(true),
      replayPronunciation,
    });
    const passedToSecondCall = replayPronunciation.mock.calls[1]![0] as {
      uploaded_path: string;
    };
    expect(passedToSecondCall.uploaded_path).toBe('u-1/c-1/abc.webm');

    const depth = await queueDepth();
    expect(depth.pendingPronunciationAttempts).toBe(0);
  });

  it('replayPronunciation { ok: false } without uploaded_path bumps attemptCount only', async () => {
    await enqueuePronunciation({
      user_id: 'u-1',
      card_id: 'c-1',
      audio_blob: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
    });
    await replayQueues({
      replayReview: vi.fn().mockResolvedValue(true),
      replayComprehension: vi.fn().mockResolvedValue(true),
      replayPronunciation: vi.fn().mockResolvedValue({ ok: false }),
    });
    const after = await getOfflineDb().pending_pronunciation_attempts.toArray();
    expect(after[0]?.uploaded_path).toBe('');
    expect(after[0]?.attemptCount).toBe(1);
  });

  it('pronunciation queue follows the same 5-attempt poison-pill drop', async () => {
    await enqueuePronunciation({
      user_id: 'u-1',
      card_id: 'c-1',
      audio_blob: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
    });
    const handler = vi.fn().mockResolvedValue({ ok: false });
    for (let i = 0; i < 5; i++) {
      await replayQueues({
        replayReview: vi.fn().mockResolvedValue(true),
        replayComprehension: vi.fn().mockResolvedValue(true),
        replayPronunciation: handler,
      });
    }
    const depth = await queueDepth();
    expect(depth.pendingPronunciationAttempts).toBe(0);
  });
});
