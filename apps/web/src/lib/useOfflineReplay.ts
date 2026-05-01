import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  canQueue,
  replayQueues,
  type PronunciationReplayResult,
  type QueuedComprehension,
  type QueuedPronunciation,
  type QueuedReview,
} from './offline-queue';
import { supabase } from './supabase';
import { uploadPronunciationBlob } from '@/features/pronunciation';

/**
 * Mount once at the app shell. Listens for `online` events and drains the
 * Dexie offline queues by calling supabase upsert/insert/Edge-Function for
 * each queued row. Per-row failures (RLS / 4xx / Anthropic 5xx) leave the
 * row in the queue with an incremented attemptCount; after 5 failures the
 * row is dropped per the `replayQueues` poison-pill defense.
 *
 * Pronunciation queueing is two-staged: upload to Storage, then invoke
 * `score-pronunciation`. If the upload succeeds but the function call
 * fails, the upload path persists in the queued row so the next attempt
 * skips re-upload.
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
          replayPronunciation: (row: QueuedPronunciation) => uploadAndScore(row),
        });
        if (result.flushed > 0) {
          // Trigger any cached dashboard / due-cards / history queries to
          // refetch — server state has changed. Key must match the actual
          // useDueCards hook (`['due-cards', userId]`), not the SQL
          // function name (`due_cards_summary`).
          qc.invalidateQueries({ queryKey: ['due-cards'] });
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

async function uploadAndScore(
  row: QueuedPronunciation,
): Promise<PronunciationReplayResult> {
  // Stage 1: upload to Storage. Skip if a prior attempt already uploaded.
  let path = row.uploaded_path;
  if (!path) {
    try {
      path = await uploadPronunciationBlob(row.audio_blob, {
        userId: row.user_id,
        cardId: row.card_id,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[offline-replay] pronunciation upload failed',
        err instanceof Error ? err.message : err,
      );
      return { ok: false };
    }
  }

  // Stage 2: invoke score-pronunciation. If this step fails, persist the
  // upload path so the next attempt skips re-upload.
  type EdgeBody = {
    data: { attempt_id: string } | null;
    error: { code: string; message: string } | null;
  };
  const invoked = await supabase.functions.invoke<EdgeBody>(
    'score-pronunciation',
    { body: { card_id: row.card_id, audio_storage_path: path } },
  );
  if (invoked.error || !invoked.data || invoked.data.error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[offline-replay] score-pronunciation failed',
      invoked.error?.message ?? invoked.data?.error?.message,
    );
    return { ok: false, uploaded_path: path };
  }
  return { ok: true };
}
