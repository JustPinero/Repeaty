import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TargetLanguage } from './useOnboardingState';

export type CompleteOnboardingInput = {
  displayName: string;
  nativeLanguageCode: string;
  targets: TargetLanguage[];
};

export type UseCompleteOnboardingResult = {
  mutateAsync: (input: CompleteOnboardingInput) => Promise<void>;
  isPending: boolean;
  error: Error | null;
};

export function useCompleteOnboarding(): UseCompleteOnboardingResult {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: CompleteOnboardingInput) => {
      const { error } = await supabase.rpc('complete_onboarding', {
        p_display_name: input.displayName,
        p_native_language_code: input.nativeLanguageCode,
        p_targets: input.targets,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });

  return {
    mutateAsync: async (input) => {
      await mutation.mutateAsync(input);
    },
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
