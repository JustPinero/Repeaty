import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import {
  canQueue,
  clearOfflineQueues,
  enqueueComprehension,
  enqueueReview,
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
});
