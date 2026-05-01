import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  bucket,
  comprehensionScore,
  similarity,
  type ScoreBucket,
} from '@repeaty/shared';
import { supabase } from '@/lib/supabase';
import { enqueueComprehension } from '@/lib/offline-queue';
import { useAuthUser } from '@/features/auth';

export type ComprehensionCard = {
  id: string;
  target_text: string;
  native_text: string;
  /** Phonetic anchor for ja/zh (kana romanization / pinyin). Null otherwise.
   * Surfaced under the target prompt so Whisper-anchored learners aren't
   * forced to guess the reading on glyph-only cards. */
  ipa: string | null;
  language_code: string;
};

export type CardResult = {
  cardId: string;
  score: number;
  bucket: ScoreBucket;
  responseMs: number;
  similarity: number;
  response: string;
  /** Set after the comprehension_attempts insert succeeds. Phase-5 useFeedback
   * keys the generate-feedback Edge Function on this. Null if the insert
   * failed (offline / RLS bug) — feedback then falls back to canned text. */
  attemptId: string | null;
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
        .select('id, target_text, native_text, ipa, language_code')
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
  // Re-entrancy guard. ComprehensionSessionPage's `submitting` flag covers the
  // user-click path; this ref is hook-internal defense-in-depth (mirrors
  // useReviewSession's pattern). Future callers (auto-rate-on-timeout, etc.)
  // get the same guarantee without needing to gate themselves.
  const submittingRef = useRef(false);

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
  // isComplete now also covers the empty-deck case (total === 0); the page's
  // empty-state branch checks `progress.total === 0` to differentiate.
  const isComplete = !isLoading && !isError && hydrated && (total === 0 || index >= total);

  const submitResponse = useCallback(
    async (response: string): Promise<CardResult> => {
      if (!currentCard) throw new Error('no current card');
      if (!userId) throw new Error('not authenticated');
      if (submittingRef.current) {
        // Re-entrant call — return the pending result if we have one, else
        // a placeholder. Caller should respect this no-op rather than retry.
        if (pendingResult) return pendingResult;
        throw new Error('submission already in flight');
      }
      submittingRef.current = true;
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
      // Persist the attempt. RLS policy `comp_insert_own` enforces that
      // user_id = auth.uid(); we set it explicitly to keep the contract
      // visible at the call site. `correct` is a coarse-grained boolean
      // derived from the bucket — anything not 'miss' counts as correct
      // for streak / dashboard purposes.
      let attemptId: string | null = null;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Offline: enqueue for replay on reconnect. The user still sees the
        // result UI immediately; attemptId stays null so the Phase-5
        // useFeedback hook falls back to canned-text rather than firing
        // generate-feedback against a row that doesn't exist server-side.
        await enqueueComprehension({
          user_id: userId,
          card_id: currentCard.id,
          response_ms: responseMs,
          correct: cardBucket !== 'miss',
        });
      } else {
        const inserted = await supabase
          .from('comprehension_attempts')
          .insert({
            user_id: userId,
            card_id: currentCard.id,
            response_ms: responseMs,
            correct: cardBucket !== 'miss',
          })
          .select('id')
          .single();
        if (inserted.error) {
          // Don't block the UX on a persistence hiccup — log and continue.
          console.error('comprehension_attempts insert failed', {
            cardId: currentCard.id,
            error: inserted.error,
          });
        }
        attemptId = (inserted.data?.id as string | undefined) ?? null;
      }

      const result: CardResult = {
        cardId: currentCard.id,
        score,
        bucket: cardBucket,
        responseMs,
        similarity: sim,
        response: trimmed,
        attemptId,
      };

      setPendingResult(result);
      submittingRef.current = false;
      return result;
    },
    [currentCard, userId, pendingResult],
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
