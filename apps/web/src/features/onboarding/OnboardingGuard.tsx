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

  const { data, isLoading } = useQuery({
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
  if (data?.needsOnboarding) return <OnboardingWizard />;
  return <>{children}</>;
}
