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
  /** v1 is synchronous + cached; Phase 5 swaps in Claude → loading goes true while in flight. */
  isLoading: boolean;
};

/**
 * v1: synchronous canned-text lookup keyed on (bucket, native-language prefix).
 *
 * Phase 5 will replace the body with a TanStack-Query-backed call to the
 * `generate-feedback` Edge Function. The signature here stays stable —
 * callers won't change.
 */
export function useFeedback(input: FeedbackInput): FeedbackResult {
  const prefix = (input.nativeLanguageCode || '').toLowerCase().split('-')[0] ?? 'en';
  const text = lookupFeedback({ bucket: input.bucket, nativeLangPrefix: prefix });
  return { text, isLoading: false };
}
