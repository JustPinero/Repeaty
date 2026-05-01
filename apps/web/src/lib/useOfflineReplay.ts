import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  canQueue,
  replayQueues,
  type QueuedComprehension,
  type QueuedReview,
} from './offline-queue';
import { supabase } from './supabase';

/**
 * Mount once at the app shell. Listens for `online` events and drains the
 * Dexie offline queues by calling supabase upsert/insert for each queued
 * row. Per-row failures (RLS / 4xx) leave the row in the queue with an
 * incremented attemptCount; after 5 failures the row is dropped per the
 * `replayQueues` poison-pill defense.
 */
export function useOfflineReplay(): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!canQueue()) return;
    if (typeof window === 'undefined') return;

    let running = false;
    async function drain() {
      if (running) return;
      running = true;
      try {
        const result = await replayQueues({
          replayReview: (row: QueuedReview) => upsertReview(row),
          replayComprehension: (row: QueuedComprehension) => insertComprehension(row),
        });
        if (result.flushed > 0) {
          // Trigger any cached dashboard / due-cards / history queries to
          // refetch — server state has changed.
          qc.invalidateQueries({ queryKey: ['due-cards-summary'] });
          qc.invalidateQueries({ queryKey: ['card-comprehension-history'] });
          qc.invalidateQueries({ queryKey: ['card-pronunciation-history'] });
        }
      } finally {
        running = false;
      }
    }

    function onOnline() {
      void drain();
    }
    window.addEventListener('online', onOnline);
    // Also drain on mount in case the user opens the app while online with
    // a queue from a prior offline session.
    if (window.navigator.onLine) void drain();

    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [qc]);
}

async function upsertReview(row: QueuedReview): Promise<boolean> {
  const { error } = await supabase.from('reviews').upsert(
    {
      user_id: row.user_id,
      card_id: row.card_id,
      fsrs_state: row.fsrs_state,
      due_at: row.due_at,
      interval_days: row.interval_days,
      ease: row.ease,
      last_reviewed_at: row.last_reviewed_at,
    },
    { onConflict: 'user_id,card_id' },
  );
  if (error) {
    // 401 / RLS denial means re-auth needed — leave in queue. Other 4xx
    // (validation) leave too; the poison-pill defense in replayQueues
    // drops after 5 attempts.
    // eslint-disable-next-line no-console
    console.warn('[offline-replay] review upsert failed', error.message);
    return false;
  }
  return true;
}

async function insertComprehension(row: QueuedComprehension): Promise<boolean> {
  const { error } = await supabase.from('comprehension_attempts').insert({
    user_id: row.user_id,
    card_id: row.card_id,
    response_ms: row.response_ms,
    correct: row.correct,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[offline-replay] comprehension insert failed', error.message);
    return false;
  }
  return true;
}
