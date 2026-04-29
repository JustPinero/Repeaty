// RED-phase stub — does not actually validate.
// GREEN phase replaces with a Zod schema that throws on missing required vars.
export type Env = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
};

export function loadEnv(_input: Record<string, unknown>): Env {
  return { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' };
}
