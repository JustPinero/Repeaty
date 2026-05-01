/**
 * `tts-jazh` — production wiring. Same per-request `Deno.serve` shape as
 * `generate-feedback` / `generate-lesson`: `bumpRateLimit` is bound to a
 * user-context Supabase client so the SECURITY DEFINER `bump_rate_limit`
 * RPC's `auth.uid()` check resolves correctly.
 *
 * Voices are env-configurable via `OPENAI_TTS_VOICE_JA` and
 * `OPENAI_TTS_VOICE_ZH` (documented in `references/env-vars.md`); falls
 * back to shimmer / nova if unset.
 */

import { createClient } from '@supabase/supabase-js';
import { createHandler, type HandlerDeps } from './handler.ts';
import { validateEnv } from '../_shared/validate-env.ts';

const env = validateEnv({
  SUPABASE_URL: { required: true },
  SUPABASE_ANON_KEY: { required: true },
  SUPABASE_SERVICE_ROLE_KEY: { required: true },
  OPENAI_API_KEY: { required: true, prefix: 'sk-' },
  OPENAI_TTS_VOICE_JA: { required: false },
  OPENAI_TTS_VOICE_ZH: { required: false },
});

const serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function userClient(jwt: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const deps: HandlerDeps = {
  async getUserFromJwt(jwt: string) {
    const { data, error } = await serviceClient.auth.getUser(jwt);
    if (error || !data.user) return null;
    return { id: data.user.id };
  },

  async getProfile(userId: string) {
    const { data, error } = await serviceClient
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return { tier: data.tier as 'free' | 'pro' | 'admin' };
  },

  async bumpRateLimit(_bucket: string, _cap: number): Promise<number> {
    throw new Error('bumpRateLimit must be bound per-request');
  },

  async callOpenAITts({ text, voice, signal }) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        response_format: 'mp3',
      }),
      signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenAI ${response.status}: ${body.slice(0, 200)}`);
    }
    return await response.arrayBuffer();
  },

  estimateTtsCostUsd(chars: number) {
    // OpenAI tts-1: ~$0.015 per 1K chars (April 2026).
    return Number((chars * 0.000015).toFixed(6));
  },

  now: () => Date.now(),
  log(line) {
    console.log(JSON.stringify(line));
  },
};

Deno.serve((req) => {
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const requestDeps: HandlerDeps = {
    ...deps,
    async bumpRateLimit(bucket: string, cap: number): Promise<number> {
      const client = jwt ? userClient(jwt) : serviceClient;
      const { data, error } = await client.rpc('bump_rate_limit', {
        p_bucket: bucket,
        p_cap_per_day: cap,
      });
      if (error) throw new Error(error.message);
      return data as number;
    },
  };
  return createHandler(requestDeps)(req);
});
