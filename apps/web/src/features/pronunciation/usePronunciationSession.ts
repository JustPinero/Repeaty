import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bucket as scoreBucket, type ScoreBucket } from '@repeaty/shared';
import { supabase } from '@/lib/supabase';
import { useAuthUser } from '@/features/auth';
import { uploadPronunciationBlob } from './storage';

export type PronunciationCard = {
  id: string;
  target_text: string;
  language_code: string;
};

export type PronunciationResult = {
  attemptId: string;
  similarityScore: number;
  /** 0–100 — `Math.round(similarityScore * 100)` for display parity with comprehension. */
  score: number;
  bucket: ScoreBucket;
  transcript: string;
};

export type PronunciationProgress = {
  reviewed: number;
  remaining: number;
  total: number;
  averageScore: number;
};

export type PronunciationSessionState = {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isComplete: boolean;
  currentCard: PronunciationCard | null;
  pendingResult: PronunciationResult | null;
  progress: PronunciationProgress;
  submitRecording: (blob: Blob) => Promise<PronunciationResult>;
  next: () => void;
};

export const DECK_NOT_FOUND = 'DECK_NOT_FOUND';
/** Pronunciation needs a connection. Offline queueing for the audio Blob +
 * the score-pronunciation round trip is tracked in DEBT-008. Until it
 * activates, `submitRecording` short-circuits with this typed error so the
 * UI surface (MicCapture) can render an actionable "reconnect and try
 * again" message instead of the generic transport-failure UX. */
export const OFFLINE_PRONUNCIATION_UNSUPPORTED = 'OFFLINE_PRONUNCIATION_UNSUPPORTED';

export function isDeckNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === DECK_NOT_FOUND;
}

export function isOfflinePronunciationError(error: unknown): boolean {
  return error instanceof Error && error.message === OFFLINE_PRONUNCIATION_UNSUPPORTED;
}

type EdgeBody<T> =
  | { data: T; error: null }
  | { data: null; error: { code: string; message: string } };

type EdgeResponse = EdgeBody<{
  attempt_id: string;
  whisper_transcript: string;
  similarity_score: number;
  expected: string;
}>;

export function usePronunciationSession(deckId: string): PronunciationSessionState {
  const { user } = useAuthUser();
  const userId = user?.id ?? null;

  const { data, isLoading, isError, error } = useQuery<PronunciationCard[], Error>({
    queryKey: ['pronunciation-session', deckId, userId],
    enabled: !!userId && !!deckId,
    queryFn: async () => {
      const deckRes = await supabase
        .from('decks')
        .select('id')
        .eq('id', deckId)
        .is('deleted_at', null)
        .maybeSingle();
      if (deckRes.error) throw new Error(deckRes.error.message);
      if (!deckRes.data) throw new Error(DECK_NOT_FOUND);

      const cardsRes = await supabase
        .from('cards')
        .select('id, target_text, language_code')
        .eq('deck_id', deckId)
        .order('id');
      if (cardsRes.error) throw new Error(cardsRes.error.message);
      return (cardsRes.data ?? []) as PronunciationCard[];
    },
  });

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<PronunciationResult[]>([]);
  const [pendingResult, setPendingResult] = useState<PronunciationResult | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (data) {
      setIndex(0);
      setResults([]);
      setPendingResult(null);
      setHydrated(true);
    }
  }, [data]);

  const cards = data ?? [];
  const total = cards.length;
  const currentCard = cards[index] ?? null;
  const isComplete =
    !isLoading && !isError && hydrated && (total === 0 || index >= total);

  const submitRecording = useCallback(
    async (blob: Blob): Promise<PronunciationResult> => {
      if (!currentCard) throw new Error('no current card');
      if (!userId) throw new Error('not authenticated');
      if (submittingRef.current) {
        if (pendingResult) return pendingResult;
        throw new Error('submission already in flight');
      }
      // Offline short-circuit. DEBT-008 will replace this with proper
      // enqueue-and-replay semantics; for v1, fail fast with a clear
      // message rather than letting supabase-js throw "Failed to fetch".
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error(OFFLINE_PRONUNCIATION_UNSUPPORTED);
      }
      submittingRef.current = true;
      try {
        const path = await uploadPronunciationBlob(blob, {
          userId,
          cardId: currentCard.id,
        });

        const invoked = await supabase.functions.invoke<EdgeResponse>(
          'score-pronunciation',
          { body: { card_id: currentCard.id, audio_storage_path: path } },
        );
        if (invoked.error) throw new Error(invoked.error.message);
        const body = invoked.data;
        if (!body || body.error) {
          throw new Error(body?.error?.message ?? 'score-pronunciation returned no data');
        }

        const score = Math.round(body.data.similarity_score * 100);
        const result: PronunciationResult = {
          attemptId: body.data.attempt_id,
          similarityScore: body.data.similarity_score,
          score,
          bucket: scoreBucket(score),
          transcript: body.data.whisper_transcript,
        };
        setPendingResult(result);
        return result;
      } finally {
        submittingRef.current = false;
      }
    },
    [currentCard, userId, pendingResult],
  );

  const next = useCallback(() => {
    if (!pendingResult) return;
    setResults((prev) => [...prev, pendingResult]);
    setPendingResult(null);
    setIndex((i) => i + 1);
  }, [pendingResult]);

  const averageScore =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
      : 0;

  return {
    isLoading,
    isError,
    error: (error as Error | null) ?? null,
    isComplete,
    currentCard,
    pendingResult,
    progress: {
      reviewed: results.length,
      remaining: Math.max(0, total - results.length),
      total,
      averageScore,
    },
    submitRecording,
    next,
  };
}
