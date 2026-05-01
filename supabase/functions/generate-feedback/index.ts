/**
 * `generate-feedback` — production wiring for the Claude proxy. Pro/admin
 * gate is enforced inside the handler via `getProfile`; rate limit lives in
 * `bumpRateLimit` (the public.bump_rate_limit RPC); cache + attempt updates
 * use the user-context client so RLS + admin write policies stay honest.
 */

import { createClient } from '@supabase/supabase-js';
import {
  createHandler,
  type AttemptForFeedback,
  type HandlerDeps,
} from './handler.ts';
import { validateEnv } from '../_shared/validate-env.ts';

const env = validateEnv({
  SUPABASE_URL: { required: true },
  SUPABASE_ANON_KEY: { required: true },
  SUPABASE_SERVICE_ROLE_KEY: { required: true },
  ANTHROPIC_API_KEY: { required: true, prefix: 'sk-ant-' },
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
      .select('tier, native_language_code')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      tier: data.tier as 'free' | 'pro' | 'admin',
      native_language_code: (data.native_language_code as string) ?? 'en',
    };
  },

  async getCefrForLanguage(userId: string, languageCode: string) {
    const { data, error } = await serviceClient
      .from('user_languages')
      .select('cefr_level')
      .eq('user_id', userId)
      .eq('language_code', languageCode)
      .maybeSingle();
    if (error || !data) return 'A1';
    return (data.cefr_level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2') ?? 'A1';
  },

  async getAttempt(kind, attemptId, jwt) {
    const client = userClient(jwt);
    if (kind === 'pronunciation') {
      const { data, error } = await client
        .from('pronunciation_attempts')
        .select(
          'id, card_id, similarity_score, whisper_transcript, cards(target_text, native_text, language_code)',
        )
        .eq('id', attemptId)
        .maybeSingle();
      if (error || !data) return null;
      type Joined = {
        id: string;
        card_id: string;
        similarity_score: number;
        whisper_transcript: string;
        cards: { target_text: string; native_text: string; language_code: string };
      };
      const j = data as unknown as Joined;
      const score = Math.round(j.similarity_score * 100);
      const bucket = score >= 90 ? 'perfect' : score >= 60 ? 'close' : 'miss';
      const out: AttemptForFeedback = {
        id: j.id,
        card_id: j.card_id,
        card_target_text: j.cards.target_text,
        card_native_text: j.cards.native_text,
        card_language_code: j.cards.language_code,
        similarity_score: j.similarity_score,
        whisper_transcript: j.whisper_transcript,
        bucket,
        kind: 'pronunciation',
      };
      return out;
    }
    // comprehension
    const { data, error } = await client
      .from('comprehension_attempts')
      .select(
        'id, card_id, response_ms, correct, cards(target_text, native_text, language_code)',
      )
      .eq('id', attemptId)
      .maybeSingle();
    if (error || !data) return null;
    type Joined = {
      id: string;
      card_id: string;
      response_ms: number;
      correct: boolean;
      cards: { target_text: string; native_text: string; language_code: string };
    };
    const j = data as unknown as Joined;
    const bucket = j.correct ? (j.response_ms < 4000 ? 'perfect' : 'close') : 'miss';
    return {
      id: j.id,
      card_id: j.card_id,
      card_target_text: j.cards.target_text,
      card_native_text: j.cards.native_text,
      card_language_code: j.cards.language_code,
      response_ms: j.response_ms,
      correct: j.correct,
      bucket,
      kind: 'comprehension',
    };
  },

  async getCachedFeedback(cardId, errorPattern, nativeLang) {
    const { data, error } = await serviceClient
      .from('feedback_cache')
      .select('feedback_text')
      .eq('card_id', cardId)
      .eq('error_pattern', errorPattern)
      .eq('native_language_code', nativeLang)
      .maybeSingle();
    if (error || !data) return null;
    return data.feedback_text as string;
  },

  async insertCachedFeedback(row) {
    const { error } = await serviceClient.from('feedback_cache').insert(row);
    if (error) throw new Error(error.message);
  },

  async updateAttemptFeedback(kind, attemptId, text) {
    const table =
      kind === 'pronunciation' ? 'pronunciation_attempts' : 'comprehension_attempts';
    const { error } = await serviceClient
      .from(table)
      .update({ feedback_text: text })
      .eq('id', attemptId);
    if (error) throw new Error(error.message);
  },

  // Placeholder — overridden per-request inside Deno.serve below so the RPC
  // resolves auth.uid() via the caller's JWT (SECURITY DEFINER reads the
  // connection's auth context, not the function's definer). Calling it via
  // the static service-role client raises UNAUTHENTICATED.
  async bumpRateLimit(_bucket: string, _cap: number): Promise<number> {
    throw new Error('bumpRateLimit must be bound per-request');
  },

  async callClaude({ system, user, signal }) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Anthropic ${response.status}: ${body.slice(0, 200)}`);
    }
    type Resp = { content: Array<{ type: string; text?: string }> };
    const json = (await response.json()) as Resp;
    const text = json.content.find((c) => c.type === 'text')?.text ?? '';
    if (!text) throw new Error('Anthropic returned no text content');
    return text;
  },

  estimateClaudeCostUsd(inputChars: number, outputChars: number) {
    // Claude Haiku 4.5 pricing (April 2026): ~$1/MTok input, ~$5/MTok output.
    // Char→token ratio ~= 4 for English+Latin, slightly higher for ja/zh.
    // Coarse approximation; the audit can tighten the formula later.
    const inputTokens = inputChars / 4;
    const outputTokens = outputChars / 4;
    return Number(
      (
        (inputTokens / 1_000_000) * 1 +
        (outputTokens / 1_000_000) * 5
      ).toFixed(6),
    );
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
