import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EdgeErrorCode } from '@repeaty/shared';

export type GenerateLessonInput = {
  languageCode: string;
  topicHint?: string;
  cardCount?: number;
};

export type GenerateLessonResponse = {
  deckId: string;
  deckName: string;
  cardCount: number;
};

export type GenerateLessonError = {
  code: EdgeErrorCode | 'NETWORK';
  message: string;
};

type EdgeBody<T> =
  | { data: T; error: null }
  | { data: null; error: { code: EdgeErrorCode; message: string } };

export function useGenerateLesson() {
  const qc = useQueryClient();

  return useMutation<GenerateLessonResponse, GenerateLessonError, GenerateLessonInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<
        EdgeBody<{
          deck_id: string;
          deck_name: string;
          card_count: number;
        }>
      >('generate-lesson', {
        body: {
          language_code: input.languageCode,
          topic_hint: input.topicHint,
          card_count: input.cardCount,
        },
      });
      if (error) {
        throw { code: 'NETWORK' as const, message: error.message };
      }
      const body = data;
      if (!body || body.error) {
        throw {
          code: (body?.error?.code ?? 'INTERNAL') as EdgeErrorCode,
          message: body?.error?.message ?? 'generate-lesson failed',
        };
      }
      return {
        deckId: body.data.deck_id,
        deckName: body.data.deck_name,
        cardCount: body.data.card_count,
      };
    },
    onSuccess: () => {
      // Invalidate dashboard + deck list so the new deck shows up.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
    },
  });
}
