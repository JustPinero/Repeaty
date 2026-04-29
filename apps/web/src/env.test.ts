import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('throws a descriptive error when VITE_SUPABASE_URL is missing', () => {
    expect(() => loadEnv({ VITE_SUPABASE_ANON_KEY: 'anon-only' })).toThrowError(
      /VITE_SUPABASE_URL/i,
    );
  });

  it('throws a descriptive error when VITE_SUPABASE_ANON_KEY is missing', () => {
    expect(() => loadEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co' })).toThrowError(
      /VITE_SUPABASE_ANON_KEY/i,
    );
  });

  it('returns parsed env when all required vars are present', () => {
    const env = loadEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(env.VITE_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.VITE_SUPABASE_ANON_KEY).toBe('anon-key');
  });
});
