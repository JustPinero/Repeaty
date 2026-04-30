import { useMemo } from 'react';
import type { ScoreBucket } from '@repeaty/shared';
import { lookupFeedback } from './canned-text';

export type FeedbackInput = {
  kind: 'comprehension';
  bucket: ScoreBucket;
  targetText: string;
  nativeText: string;
  userResponse: string;
  /** Full BCP-47 code (e.g. `en-US`, `es-ES`). Stripped to two-char prefix internally. */
  nativeLanguageCode: string;
};

export type FeedbackResult = {
  text: string | null;
  /** v1 is synchronous; Phase 5 swaps in Claude → goes `true` while a useQuery is fetching. */
  isLoading: boolean;
};

/**
 * v1: synchronous canned-text lookup keyed on (bucket, native-language prefix).
 *
 * Hook shape: uses `useMemo` so we obey the rules of hooks (consistent React
 * internal call count) and so the Phase-5 swap-in (which adds `useQuery`) is a
 * drop-in body change without any caller-visible reorder. The `useMemo`
 * dependency list mirrors the would-be `useQuery` queryKey shape.
 *
 * Phase 5 will replace the body with a TanStack-Query call to the
 * `generate-feedback` Edge Function. The signature stays stable —
 * `FeedbackInput` and `FeedbackResult` are preserved per the API-contracts
 * doc.
 */
export function useFeedback(input: FeedbackInput): FeedbackResult {
  const text = useMemo(() => {
    const prefix = (input.nativeLanguageCode || '').toLowerCase().split('-')[0] ?? 'en';
    return lookupFeedback({ bucket: input.bucket, nativeLangPrefix: prefix });
  }, [input.bucket, input.nativeLanguageCode]);

  return { text, isLoading: false };
}
