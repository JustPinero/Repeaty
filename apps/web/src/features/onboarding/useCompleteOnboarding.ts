// RED-phase stub — does not actually call the RPC.
// GREEN replaces with useMutation around supabase.rpc('complete_onboarding', ...).
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
  return {
    mutateAsync: async () => {
      throw new Error('useCompleteOnboarding stub — replaced in GREEN');
    },
    isPending: false,
    error: null,
  };
}
