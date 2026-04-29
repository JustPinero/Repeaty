import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthUser } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { OnboardingWizard } from './OnboardingWizard';

type OnboardingStatus = {
  needsOnboarding: boolean;
};

type Props = {
  children: ReactNode;
};

export function OnboardingGuard({ children }: Props) {
  const { user } = useAuthUser();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['onboarding-status', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<OnboardingStatus> => {
      const profile = await supabase
        .from('profiles')
        .select('display_name, native_language_code')
        .eq('id', user!.id)
        .single();
      if (profile.error) throw new Error(profile.error.message);

      const userLangs = await supabase
        .from('user_languages')
        .select('language_code')
        .eq('user_id', user!.id);
      if (userLangs.error) throw new Error(userLangs.error.message);

      const profileFilled =
        profile.data.display_name !== null && profile.data.native_language_code !== null;
      const hasTargets = (userLangs.data ?? []).length > 0;

      return { needsOnboarding: !profileFilled || !hasTargets };
    },
  });

  if (!user) return null; // RequireAuth handles redirect; this branch is just defensive.
  if (isLoading) return null;

  if (isError) {
    return (
      <main
        role="alert"
        className="min-h-full bg-peaty-cream text-stone-800 flex items-center justify-center p-6"
      >
        <div className="w-full max-w-md rounded-xl bg-white shadow-md p-6 text-center space-y-3">
          <h1 className="text-xl font-semibold">We couldn’t load your profile</h1>
          <p className="text-sm text-stone-600">{(error as Error).message}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded bg-peaty-green px-4 py-2 font-medium text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (data?.needsOnboarding) return <OnboardingWizard />;
  return <>{children}</>;
}
