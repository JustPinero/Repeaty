// RED-phase stub — always returns loading=false, user=null.
// GREEN replaces with a real subscription to supabase.auth + TanStack Query.
import type { User } from '@supabase/supabase-js';

export type AuthState = {
  user: User | null;
  isLoading: boolean;
};

export function useAuthUser(): AuthState {
  return { user: null, isLoading: false };
}
