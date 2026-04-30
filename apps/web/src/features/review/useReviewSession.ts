import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { initialState, schedule, Rating, type FsrsState } from '@repeaty/shared';
import { supabase } from '@/lib/supabase';
import { useAuthUser } from '@/features/auth';

export type ReviewCard = {
  id: string;
  target_text: string;
  native_text: string;
  ipa: string | null;
  example_sentence_target: string | null;
  example_sentence_native: string | null;
  language_code: string;
};

export type ReviewProgress = {
  reviewed: number;
  remaining: number;
  total: number;
  correct: number;
};

export type ReviewSessionState = {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isComplete: boolean;
  currentCard: ReviewCard | null;
  progress: ReviewProgress;
  submitRating: (rating: Rating) => Promise<void>;
};

type QueueItem = {
  card: ReviewCard;
  state: FsrsState;
};

type SessionData = {
  items: QueueItem[];
};

export function useReviewSession(deckId: string): ReviewSessionState {
  const { user } = useAuthUser();
  const userId = user?.id ?? null;

  const { data, isLoading, isError, error } = useQuery<SessionData, Error>({
    queryKey: ['review-session', deckId, userId],
    enabled: !!userId && !!deckId,
    queryFn: async () => {
      // Single round-trip via supabase-js's nested-select syntax: pulls the
      // user's review-row (or none) for each card in one query. The reviews
      // RLS policy already scopes to auth.uid() = user_id, so we don't need
      // an extra `.eq('reviews.user_id', ...)` filter — but we keep it
      // explicit-and-correct as a defense-in-depth annotation.
      const res = await supabase
        .from('cards')
        .select(
          `id, target_text, native_text, ipa, example_sentence_target, example_sentence_native, language_code,
           reviews(fsrs_state)`,
        )
        .eq('deck_id', deckId)
        .eq('reviews.user_id', userId!)
        .order('id');
      if (res.error) throw new Error(res.error.message);
      const rows = (res.data ?? []) as Array<
        ReviewCard & { reviews: Array<{ fsrs_state: FsrsState }> }
      >;

      const now = new Date();
      const items: QueueItem[] = rows.map((row) => {
        const persistedState = row.reviews[0]?.fsrs_state;
        const { reviews: _reviews, ...card } = row;
        void _reviews;
        return {
          card,
          state: persistedState ?? initialState(now),
        };
      });
      return { items };
    },
  });

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (data?.items) {
      setQueue(data.items);
      setTotal(data.items.length);
      setReviewedCount(0);
      setCorrectCount(0);
      setHydrated(true);
    }
  }, [data]);

  const submitRating = useCallback(
    async (rating: Rating) => {
      if (!userId) return;
      const head = queue[0];
      if (!head) return;

      const now = new Date();
      const newState = schedule(head.state, rating, now);

      const { error: upsertError } = await supabase.from('reviews').upsert(
        {
          user_id: userId,
          card_id: head.card.id,
          fsrs_state: newState,
          due_at: newState.due,
          interval_days: newState.scheduled_days,
          ease: newState.difficulty,
          last_reviewed_at: now.toISOString(),
        },
        { onConflict: 'user_id,card_id' },
      );
      if (upsertError) throw new Error(upsertError.message);

      setQueue((prev) => {
        const rest = prev.slice(1);
        return rating === Rating.Again ? [...rest, { card: head.card, state: newState }] : rest;
      });
      setReviewedCount((c) => c + 1);
      if (rating !== Rating.Again) setCorrectCount((c) => c + 1);
    },
    [userId, queue],
  );

  const currentCard = queue[0]?.card ?? null;
  const isComplete = !isLoading && !isError && hydrated && queue.length === 0;

  return {
    isLoading,
    isError,
    error: (error as Error | null) ?? null,
    isComplete,
    currentCard,
    progress: {
      reviewed: reviewedCount,
      remaining: queue.length,
      total,
      correct: correctCount,
    },
    submitRating,
  };
}
