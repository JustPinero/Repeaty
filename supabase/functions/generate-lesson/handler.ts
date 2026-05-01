/**
 * `generate-lesson` Edge Function — Pro/admin-only Claude proxy.
 * Generates a personalised flashcard deck and inserts it (+cards) atomically
 * via the `insert_ai_deck_with_cards` RPC.
 */

import { z } from 'zod';
import {
  buildLessonPrompt,
  LessonOutputSchema,
  stripFence,
  type LessonOutput,
} from '../../../packages/shared/src/lesson-prompt.ts';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonSuccess } from '../_shared/error.ts';

const RequestSchema = z.object({
  language_code: z.string().min(2).max(8),
  topic_hint: z.string().max(200).optional(),
  card_count: z.number().int().optional(),
});
type RequestBody = z.infer<typeof RequestSchema>;

const LESSON_DAILY_CAP = 10;
const CLAUDE_TIMEOUT_MS = 15_000;
const MIN_CARDS = 5;
const MAX_CARDS = 25;
const DEFAULT_CARDS = 12;

export type Profile = {
  tier: 'free' | 'pro' | 'admin';
  native_language_code: string;
};

export type UserLanguage = {
  cefr_level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
};

export type HandlerDeps = {
  getUserFromJwt(jwt: string): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<Profile | null>;
  getUserLanguage(userId: string, languageCode: string): Promise<UserLanguage | null>;
  getRecentWeakWords(
    userId: string,
    languageCode: string,
    limit: number,
  ): Promise<string[]>;
  bumpRateLimit(bucket: string, cap: number): Promise<number>;
  callClaude(args: { system: string; user: string; signal: AbortSignal }): Promise<string>;
  insertDeckWithCards(
    ownerId: string,
    languageCode: string,
    cefr: string,
    deckName: string,
    cards: LessonOutput['cards'],
  ): Promise<string>;
  estimateClaudeCostUsd(inputChars: number, outputChars: number): number;
  now(): number;
  log(line: object): void;
};

export function createHandler(deps: HandlerDeps) {
  return async function handler(req: Request): Promise<Response> {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;

    const startedAt = deps.now();
    const requestId = crypto.randomUUID();

    if (req.method !== 'POST') {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: null,
        costEstimateUsd: null,
        result: jsonError('INVALID_PAYLOAD', 'Only POST is supported'),
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: null,
        costEstimateUsd: null,
        result: jsonError('UNAUTHENTICATED', 'Missing JWT'),
      });
    }
    const user = await deps.getUserFromJwt(jwt);
    if (!user) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: null,
        costEstimateUsd: null,
        result: jsonError('UNAUTHENTICATED', 'Invalid JWT'),
      });
    }

    let parsed: RequestBody;
    try {
      const raw = (await req.json()) as unknown;
      const out = RequestSchema.safeParse(raw);
      if (!out.success) {
        return finalize({
          deps,
          requestId,
          startedAt,
          userId: user.id,
          costEstimateUsd: null,
          result: jsonError(
            'INVALID_PAYLOAD',
            out.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        });
      }
      parsed = out.data;
    } catch (err) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        costEstimateUsd: null,
        result: jsonError(
          'INVALID_PAYLOAD',
          err instanceof Error ? err.message : 'invalid JSON',
        ),
      });
    }

    const profile = await deps.getProfile(user.id);
    if (!profile) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        costEstimateUsd: null,
        result: jsonError('NOT_FOUND', 'Profile not found'),
      });
    }
    if (profile.tier === 'free') {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        costEstimateUsd: null,
        result: jsonError(
          'FORBIDDEN_TIER',
          'Lesson generation requires Pro tier',
        ),
      });
    }

    const userLang = await deps.getUserLanguage(user.id, parsed.language_code);
    if (!userLang) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        costEstimateUsd: null,
        result: jsonError(
          'INVALID_PAYLOAD',
          `language_code "${parsed.language_code}" not in your user_languages`,
        ),
      });
    }

    const cardCount = clamp(parsed.card_count ?? DEFAULT_CARDS, MIN_CARDS, MAX_CARDS);
    const weakWords = await deps.getRecentWeakWords(user.id, parsed.language_code, 50);

    try {
      await deps.bumpRateLimit('lesson_generation', LESSON_DAILY_CAP);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'rate limit error';
      if (/RATE_LIMITED/.test(msg)) {
        return finalize({
          deps,
          requestId,
          startedAt,
          userId: user.id,
          costEstimateUsd: null,
          result: jsonError('RATE_LIMITED', msg),
        });
      }
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        costEstimateUsd: null,
        result: jsonError('INTERNAL', msg),
      });
    }

    const prompt = buildLessonPrompt({
      targetLanguage: parsed.language_code,
      nativeLanguageCode: profile.native_language_code,
      cefrLevel: userLang.cefr_level,
      topicHint: parsed.topic_hint,
      cardCount,
      weakWords,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
    let raw: string;
    try {
      raw = await deps.callClaude({
        system: prompt.system,
        user: prompt.user,
        signal: controller.signal,
      });
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
      const code = isAbort ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILED';
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        costEstimateUsd: null,
        result: jsonError(code, err instanceof Error ? err.message : 'Claude call failed'),
      });
    } finally {
      clearTimeout(timer);
    }

    let parsedOutput: LessonOutput;
    try {
      parsedOutput = LessonOutputSchema.parse(JSON.parse(stripFence(raw)));
    } catch (err) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        costEstimateUsd: null,
        result: jsonError(
          'UPSTREAM_FAILED',
          `Claude returned malformed lesson: ${err instanceof Error ? err.message : 'parse error'}`,
        ),
      });
    }

    let deckId: string;
    try {
      deckId = await deps.insertDeckWithCards(
        user.id,
        parsed.language_code,
        userLang.cefr_level,
        parsedOutput.deck_name,
        parsedOutput.cards,
      );
    } catch (err) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        costEstimateUsd: null,
        result: jsonError(
          'INTERNAL',
          err instanceof Error ? err.message : 'deck insert failed',
        ),
      });
    }

    const inputChars = prompt.system.length + prompt.user.length;
    const outputChars = raw.length;
    const costEstimateUsd = deps.estimateClaudeCostUsd(inputChars, outputChars);

    return finalize({
      deps,
      requestId,
      startedAt,
      userId: user.id,
      costEstimateUsd,
      result: jsonSuccess({
        deck_id: deckId,
        deck_name: parsedOutput.deck_name,
        card_count: parsedOutput.cards.length,
        cost_estimate_usd: costEstimateUsd,
      }),
    });
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function finalize(args: {
  deps: HandlerDeps;
  requestId: string;
  startedAt: number;
  userId: string | null;
  costEstimateUsd: number | null;
  result: Response;
}): Response {
  const latency_ms = args.deps.now() - args.startedAt;
  args.deps.log({
    fn: 'generate-lesson',
    request_id: args.requestId,
    user_id: args.userId,
    status: args.result.status,
    latency_ms,
    cost_estimate_usd: args.costEstimateUsd,
  });
  return args.result;
}
