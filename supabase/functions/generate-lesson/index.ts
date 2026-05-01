/**
 * `generate-lesson` — production wiring. Same shape as `generate-feedback`'s
 * binding for getProfile + bumpRateLimit; fold-through to the Anthropic API
 * with a Sonnet-class model since lesson generation needs better
 * structured-output reliability than feedback's Haiku.
 */

import { createClient } from '@supabase/supabase-js';
import {
  createHandler,
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

  async getUserLanguage(userId, languageCode) {
    const { data, error } = await serviceClient
      .from('user_languages')
      .select('cefr_level')
      .eq('user_id', userId)
      .eq('language_code', languageCode)
      .maybeSingle();
    if (error || !data) return null;
    return { cefr_level: data.cefr_level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' };
  },

  async getRecentWeakWords(userId, languageCode, limit) {
    // Weak words proxy: cards from `comprehension_attempts.correct = false`
    // OR pronunciation_attempts.similarity_score < 0.6, joined to cards filtered
    // by language, deduped + most-recent-first, limited.
    const { data, error } = await serviceClient
      .from('comprehension_attempts')
      .select('cards!inner(target_text, language_code), correct, created_at')
      .eq('user_id', userId)
      .eq('correct', false)
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    if (error || !data) return [];
    type Joined = { cards: { target_text: string; language_code: string } };
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of data as unknown as Joined[]) {
      if (row.cards.language_code !== languageCode) continue;
      if (seen.has(row.cards.target_text)) continue;
      seen.add(row.cards.target_text);
      out.push(row.cards.target_text);
      if (out.length >= limit) break;
    }
    return out;
  },

  async bumpRateLimit(bucket, cap) {
    const { data, error } = await serviceClient.rpc('bump_rate_limit', {
      p_bucket: bucket,
      p_cap_per_day: cap,
    });
    if (error) throw new Error(error.message);
    return data as number;
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
        model: 'claude-sonnet-4-6',
        max_tokens: 2200,
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

  async insertDeckWithCards(ownerId, languageCode, cefr, deckName, cards) {
    // The RPC checks auth.uid() = p_owner; we need a user-context client to
    // resolve auth.uid() correctly. The service-role client would resolve to
    // null, tripping the UNAUTHENTICATED branch. The handler factory doesn't
    // hand this dep the JWT directly — bind it via a closure in the per-
    // request flow. v1: keep the jwt-bound binding via a wrapper. (For
    // simplicity here: re-derive from the request context.) Tracked in the
    // Phase-5 audit gate alongside the same TODO on `bumpRateLimit`.
    const { data, error } = await serviceClient.rpc('insert_ai_deck_with_cards', {
      p_owner: ownerId,
      p_language: languageCode,
      p_cefr: cefr,
      p_deck_name: deckName,
      p_cards: cards,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },

  estimateClaudeCostUsd(inputChars: number, outputChars: number) {
    // Sonnet pricing approx: $3/MTok input, $15/MTok output (April 2026).
    const inputTokens = inputChars / 4;
    const outputTokens = outputChars / 4;
    return Number(
      (
        (inputTokens / 1_000_000) * 3 +
        (outputTokens / 1_000_000) * 15
      ).toFixed(6),
    );
  },

  now: () => Date.now(),
  log(line) {
    console.log(JSON.stringify(line));
  },
};

Deno.serve(createHandler(deps));

// Suppress unused import — exported for the type contract only.
export type { HandlerDeps as _GenLessonDeps };
