import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from '@/env';

const env = loadEnv(import.meta.env as unknown as Record<string, unknown>);

export const supabase: SupabaseClient = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
