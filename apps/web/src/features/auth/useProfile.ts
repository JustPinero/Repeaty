import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthUser } from './useAuthUser';

export type Profile = {
  id: string;
  display_name: string | null;
  email: string;
  native_language_code: string | null;
  tier: 'free' | 'pro' | 'admin';
  is_admin: boolean;
};

export type ProfileState = {
  profile: Profile | null;
  isLoading: boolean;
};

/**
 * Loads the caller's own `profiles` row. Used by the dashboard to gate Pro
 * affordances and by `AdminGuard` to gate `/admin`.
 */
export function useProfile(): ProfileState {
  const { user } = useAuthUser();
  const userId = user?.id ?? null;

  const { data, isLoading } = useQuery<Profile | null>({
    queryKey: ['profile', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, email, native_language_code, tier, is_admin')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as Profile | null;
    },
  });

  return { profile: data ?? null, isLoading };
}
