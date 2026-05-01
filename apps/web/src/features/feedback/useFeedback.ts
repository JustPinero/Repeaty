import { useQuery } from '@tanstack/react-query';
import type { ScoreBucket, EdgeErrorCode } from '@repeaty/shared';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/features/auth';
import { lookupFeedback } from './canned-text';

export type FeedbackInput = {
  /** `comprehension` (Phase 3) or `pronunciation` (Phase 4). */
  kind: 'comprehension' | 'pronunciation';
  bucket: ScoreBucket;
  targetText: string;
  nativeText: string;
  userResponse: string;
  /** Full BCP-47 code (e.g. `en-US`, `es-ES`). Stripped to two-char prefix internally. */
  nativeLanguageCode: string;
  /** Phase-5 addition. Required when the hook should fetch from the
   * `generate-feedback` Edge Function. Optional so existing call sites that
   * have already set up but not yet started passing it (Phase-5 dev) keep
   * compiling — without this, the hook falls back to the canned-text path. */
  attemptId?: string;
};

export type FeedbackResult = {
  text: string | null;
  isLoading: boolean;
};

type EdgeBody<T> =
  | { data: T; error: null }
  | { data: null; error: { code: EdgeErrorCode; message: string } };

/**
 * Phase-5 swap: Pro/admin callers with a non-perfect attempt fetch from the
 * `generate-feedback` Edge Function (cached server-side per
 * `(card_id, error_pattern, native_language_code)`); free-tier or perfect
 * callers fall back to the Phase-3 canned-text lookup so the textual answer
 * never blocks on the network.
 *
 * Public types (`FeedbackInput` + `FeedbackResult`) preserved per
 * `references/api-contracts.md`.
 */
export function useFeedback(input: FeedbackInput): FeedbackResult {
  const { profile } = useProfile();
  const isPro = profile?.tier === 'pro' || profile?.tier === 'admin';
  const enabled =
    isPro && input.bucket !== 'perfect' && !!input.attemptId;

  const { data, isLoading } = useQuery<string | null>({
    queryKey: ['generate-feedback', input.kind, input.attemptId, profile?.id],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<
        EdgeBody<{ feedback_text: string; cached: boolean }>
      >('generate-feedback', {
        body: { kind: input.kind, attempt_id: input.attemptId },
      });
      if (error) {
        // Network / 5xx — surface no feedback rather than a red error.
        // The textual answer is still readable.
        // eslint-disable-next-line no-console
        console.warn('generate-feedback transport error', error);
        return null;
      }
      const body = data;
      if (!body || body.error) {
        // eslint-disable-next-line no-console
        console.warn('generate-feedback edge error', body?.error);
        return null;
      }
      return body.data.feedback_text;
    },
  });

  if (enabled) {
    return { text: data ?? null, isLoading };
  }

  // Free tier, perfect bucket, or no attemptId → canned-text fallback.
  // Same shape as Phase 3.
  const prefix = (input.nativeLanguageCode || '').toLowerCase().split('-')[0] ?? 'en';
  const fallback = lookupFeedback({ bucket: input.bucket, nativeLangPrefix: prefix });
  return { text: fallback, isLoading: false };
}
