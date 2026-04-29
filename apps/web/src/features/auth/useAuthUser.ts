import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AuthState = {
  user: User | null;
  isLoading: boolean;
};

const AUTH_KEY = ['auth-user'] as const;

export function useAuthUser(): AuthState {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: AUTH_KEY,
    queryFn: async (): Promise<User | null> => {
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      return data.user ?? null;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      qc.setQueryData<User | null>(AUTH_KEY, session?.user ?? null);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [qc]);

  return { user: data ?? null, isLoading };
}
