import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  bucket,
  comprehensionScore,
  similarity,
  type ScoreBucket,
} from '@repeaty/shared';
import { supabase } from '@/lib/supabase';
import { useAuthUser } from '@/features/auth';

export type ComprehensionCard = {
  id: string;
  target_text: string;
  native_text: string;
  language_code: string;
};

export type CardResult = {
  cardId: string;
  score: number;
  bucket: ScoreBucket;
  responseMs: number;
  similarity: number;
  response: string;
};

export type ComprehensionProgress = {
  reviewed: number;
  remaining: number;
  total: number;
  averageScore: number;
  averageResponseMs: number;
};

export type ComprehensionSessionState = {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isComplete: boolean;
  currentCard: ComprehensionCard | null;
  pendingResult: CardResult | null;
  progress: ComprehensionProgress;
  submitResponse: (response: string) => Promise<CardResult>;
  next: () => void;
};

export const DECK_NOT_FOUND = 'DECK_NOT_FOUND';

export function isDeckNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === DECK_NOT_FOUND;
}

export function useComprehensionSession(deckId: string): ComprehensionSessionState {
  const { user } = useAuthUser();
  const userId = user?.id ?? null;

  const { data, isLoading, isError, error } = useQuery<ComprehensionCard[], Error>({
    queryKey: ['comprehension-session', deckId, userId],
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
        .select('id, target_text, native_text, language_code')
        .eq('deck_id', deckId)
        .order('id');
      if (cardsRes.error) throw new Error(cardsRes.error.message);
      return (cardsRes.data ?? []) as ComprehensionCard[];
    },
  });

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<CardResult[]>([]);
  const [pendingResult, setPendingResult] = useState<CardResult | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const cardStartedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (data) {
      setIndex(0);
      setResults([]);
      setPendingResult(null);
      setHydrated(true);
      cardStartedAt.current = Date.now();
    }
  }, [data]);

  const cards = data ?? [];
  const total = cards.length;
  const currentCard = cards[index] ?? null;
  const isComplete = !isLoading && !isError && hydrated && index >= total && total > 0;

  const submitResponse = useCallback(
    async (response: string): Promise<CardResult> => {
      if (!currentCard) throw new Error('no current card');
      if (!userId) throw new Error('not authenticated');
      const trimmed = response.trim();
      const responseMs = Math.max(0, Date.now() - cardStartedAt.current);
      const sim = similarity(currentCard.native_text, trimmed, {
        // Translation answer is in the user's NATIVE language, but we don't
        // know that language at the card level. The comprehension prompt is
        // displayed in the target language; the answer is in the native
        // language. Use no lang for v1 — diacritic fold isn't needed for
        // English-prevalent native answers. Russian-as-native users will get
        // strict matching, which is fine for "yes"/"no"/"thank you" etc.
      });
      const score = comprehensionScore(sim, responseMs);
      const cardBucket = bucket(score);
      const result: CardResult = {
        cardId: currentCard.id,
        score,
        bucket: cardBucket,
        responseMs,
        similarity: sim,
        response: trimmed,
      };

      // Persist the attempt. RLS policy `comp_insert_own` enforces that
      // user_id = auth.uid(); we set it explicitly to keep the contract
      // visible at the call site. `correct` is a coarse-grained boolean
      // derived from the bucket — anything not 'miss' counts as correct
      // for streak / dashboard purposes.
      const { error: insertError } = await supabase
        .from('comprehension_attempts')
        .insert({
          user_id: userId,
          card_id: currentCard.id,
          response_ms: responseMs,
          correct: cardBucket !== 'miss',
        });
      if (insertError) {
        // Don't block the UX on a persistence hiccup — log and continue.
        // Future Phase-6 offline queue (Dexie) will absorb retry semantics.
        console.error('comprehension_attempts insert failed', { cardId: currentCard.id, error: insertError });
      }

      setPendingResult(result);
      return result;
    },
    [currentCard, userId],
  );

  const next = useCallback(() => {
    if (!pendingResult) return;
    setResults((prev) => [...prev, pendingResult]);
    setPendingResult(null);
    setIndex((i) => i + 1);
    cardStartedAt.current = Date.now();
  }, [pendingResult]);

  const averageScore =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
      : 0;
  const averageResponseMs =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.responseMs, 0) / results.length)
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
      averageResponseMs,
    },
    submitResponse,
    next,
  };
}
