/**
 * `score-pronunciation` — production entry point.
 *
 * The actual logic lives in `handler.ts` so it can be tested without booting
 * Deno.serve / hitting OpenAI / hitting Supabase. This file just wires the
 * real deps.
 */

import { createClient } from '@supabase/supabase-js';
import { createHandler, type HandlerDeps } from './handler.ts';
import { validateEnv } from '../_shared/validate-env.ts';

const env = validateEnv({
  SUPABASE_URL: { required: true },
  SUPABASE_ANON_KEY: { required: true },
  SUPABASE_SERVICE_ROLE_KEY: { required: true },
  OPENAI_API_KEY: { required: true, prefix: 'sk-' },
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

  async getCardForUser(cardId: string, jwt: string) {
    const client = userClient(jwt);
    const { data, error } = await client
      .from('cards')
      .select('id, target_text, language_code')
      .eq('id', cardId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  },

  async downloadAudio(path: string) {
    const { data, error } = await serviceClient.storage
      .from('pronunciation-audio')
      .download(path);
    if (error || !data) return null;
    return data;
  },

  async transcribeAudio({ audio, language, signal }) {
    const form = new FormData();
    form.append('file', audio, 'audio');
    form.append('model', 'whisper-1');
    form.append('language', language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
      signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenAI ${response.status}: ${body.slice(0, 200)}`);
    }
    const json = (await response.json()) as { text?: string };
    if (typeof json.text !== 'string') {
      throw new Error('OpenAI response missing `text` field');
    }
    return json.text;
  },

  async insertAttempt(row) {
    const { data, error } = await serviceClient
      .from('pronunciation_attempts')
      .insert(row)
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`pronunciation_attempts insert failed: ${error?.message ?? 'no data'}`);
    }
    return { id: data.id };
  },

  now: () => Date.now(),

  log(line) {
    console.log(JSON.stringify(line));
  },
};

const handler = createHandler(deps);

Deno.serve(handler);
