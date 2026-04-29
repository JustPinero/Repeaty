// RED stub — returns a frozen "loading forever" state.
import type { Rating } from '@repeaty/shared';

export type ReviewCard = {
  id: string;
  target_text: string;
  native_text: string;
  ipa: string | null;
  example_sentence_target: string | null;
  example_sentence_native: string | null;
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

export function useReviewSession(_deckId: string): ReviewSessionState {
  return {
    isLoading: true,
    isError: false,
    error: null,
    isComplete: false,
    currentCard: null,
    progress: { reviewed: 0, remaining: 0, total: 0, correct: 0 },
    submitRating: async () => {
      throw new Error('useReviewSession stub — replaced in GREEN');
    },
  };
}
