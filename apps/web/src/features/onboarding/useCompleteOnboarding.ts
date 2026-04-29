import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
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

const SESSION_EXPIRED_MARKER = 'SESSION_EXPIRED';

export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(SESSION_EXPIRED_MARKER);
}

function mapRpcError(error: PostgrestError | { code?: string; message: string }): Error {
  const code = (error as { code?: string }).code;
  const message = error.message ?? 'Unknown error';

  if (code === '42501' || /not authenticated/i.test(message)) {
    return new Error(`${SESSION_EXPIRED_MARKER}: Your session has expired. Please sign in again.`);
  }
  if (code === '22023') {
    return new Error("We couldn't save your onboarding details — please double-check and try again.");
  }
  return new Error(message);
}

export function useCompleteOnboarding(): UseCompleteOnboardingResult {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: CompleteOnboardingInput) => {
      const { error } = await supabase.rpc('complete_onboarding', {
        p_display_name: input.displayName,
        p_native_language_code: input.nativeLanguageCode,
        p_targets: input.targets,
      });
      if (error) throw mapRpcError(error);
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
