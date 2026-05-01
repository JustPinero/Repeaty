/**
 * `generate-feedback` Edge Function — Pro/admin-only Claude proxy.
 *
 * Auth → tier gate → body parse → load attempt + card + profile context →
 * compute error_pattern key → check feedback_cache → on hit return cached
 * text, on miss bump rate limit, build prompt, call Claude (15s
 * AbortController, response_format json), strip fences, Zod parse, persist
 * cache + update source attempt's feedback_text → return.
 */

import { z } from 'zod';
import {
  buildFeedbackPrompt,
  FeedbackOutputSchema,
  type FeedbackPromptInput,
} from '../../../packages/shared/src/feedback-prompt.ts';
import { stripFence } from '../../../packages/shared/src/strip-fence.ts';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonSuccess } from '../_shared/error.ts';

const RequestSchema = z.object({
  kind: z.enum(['comprehension', 'pronunciation']),
  attempt_id: z.string().uuid(),
});
type RequestBody = z.infer<typeof RequestSchema>;

const FEEDBACK_DAILY_CAP = 25;
const CLAUDE_TIMEOUT_MS = 15_000;

export type AttemptForFeedback = {
  id: string;
  card_id: string;
  card_target_text: string;
  card_native_text: string;
  card_language_code: string;
  /** comprehension fields, optional. */
  response_ms?: number;
  correct?: boolean;
  user_text?: string;
  /** pronunciation fields, optional. */
  similarity_score?: number;
  whisper_transcript?: string;
  /** computed bucket — perfect / close / miss. */
  bucket: 'perfect' | 'close' | 'miss';
  kind: 'comprehension' | 'pronunciation';
};

export type Profile = {
  tier: 'free' | 'pro' | 'admin';
  native_language_code: string;
};

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type CacheRow = {
  card_id: string;
  error_pattern: string;
  native_language_code: string;
  feedback_text: string;
};

export type HandlerDeps = {
  getUserFromJwt(jwt: string): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<Profile | null>;
  /** CEFR for a specific (user, language). The handler calls this after the
   * attempt loads so the prompt's level matches the *card*'s language, not
   * the user's first user_languages row. Returns 'A1' if the user has no
   * row for that language (lossy edge case). */
  getCefrForLanguage(userId: string, languageCode: string): Promise<CefrLevel>;
  getAttempt(
    kind: 'comprehension' | 'pronunciation',
    attemptId: string,
    jwt: string,
  ): Promise<AttemptForFeedback | null>;
  getCachedFeedback(
    cardId: string,
    errorPattern: string,
    nativeLang: string,
  ): Promise<string | null>;
  insertCachedFeedback(row: CacheRow): Promise<void>;
  updateAttemptFeedback(
    kind: 'comprehension' | 'pronunciation',
    attemptId: string,
    text: string,
  ): Promise<void>;
  bumpRateLimit(bucket: string, cap: number): Promise<number>;
  callClaude(args: { system: string; user: string; signal: AbortSignal }): Promise<string>;
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
        cacheHit: null,
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
        cacheHit: null,
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
        cacheHit: null,
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
          cacheHit: null,
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
        cacheHit: null,
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
        cacheHit: null,
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
        cacheHit: null,
        costEstimateUsd: null,
        result: jsonError(
          'FORBIDDEN_TIER',
          'AI feedback requires Pro tier',
        ),
      });
    }

    const attempt = await deps.getAttempt(parsed.kind, parsed.attempt_id, jwt);
    if (!attempt) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        cacheHit: null,
        costEstimateUsd: null,
        result: jsonError('NOT_FOUND', 'Attempt not found or not accessible'),
      });
    }
    if (attempt.bucket === 'perfect') {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        cacheHit: null,
        costEstimateUsd: null,
        result: jsonError(
          'INVALID_PAYLOAD',
          'No feedback needed for perfect attempts',
        ),
      });
    }

    const errorPattern = computeErrorPattern(attempt);
    const nativeLangPrefix = profile.native_language_code.toLowerCase().split('-')[0]!;

    const cached = await deps.getCachedFeedback(
      attempt.card_id,
      errorPattern,
      nativeLangPrefix,
    );
    if (cached) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        cacheHit: true,
        costEstimateUsd: 0,
        result: jsonSuccess({ feedback_text: cached, cached: true }),
      });
    }

    // Cache miss — bump rate limit before paying for the Claude call.
    try {
      await deps.bumpRateLimit('feedback_generation', FEEDBACK_DAILY_CAP);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'rate limit error';
      if (/RATE_LIMITED/.test(msg)) {
        return finalize({
          deps,
          requestId,
          startedAt,
          userId: user.id,
          cacheHit: false,
          costEstimateUsd: null,
          result: jsonError('RATE_LIMITED', msg),
        });
      }
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        cacheHit: false,
        costEstimateUsd: null,
        result: jsonError('INTERNAL', msg),
      });
    }

    // CEFR matches the CARD's language (not the user's first user_languages
    // row). A user studying es@A1 + fr@B2 gets A1 prompts for es cards and
    // B2 prompts for fr cards. Falls back to A1 if no row exists for the
    // card's language.
    const cefrLevel = await deps.getCefrForLanguage(
      user.id,
      attempt.card_language_code,
    );

    const promptInput: FeedbackPromptInput = {
      targetLanguage: attempt.card_language_code,
      nativeLanguageCode: profile.native_language_code,
      cefrLevel,
      cardTargetText: attempt.card_target_text,
      cardNativeText: attempt.card_native_text,
      attempt:
        attempt.kind === 'comprehension'
          ? {
              kind: 'comprehension',
              responseMs: attempt.response_ms ?? 0,
              correct: attempt.correct ?? false,
              userText: attempt.user_text ?? '',
            }
          : {
              kind: 'pronunciation',
              similarityScore: attempt.similarity_score ?? 0,
              whisperText: attempt.whisper_transcript ?? '',
            },
    };
    const prompt = buildFeedbackPrompt(promptInput);

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
        cacheHit: false,
        costEstimateUsd: null,
        result: jsonError(code, err instanceof Error ? err.message : 'Claude call failed'),
      });
    } finally {
      clearTimeout(timer);
    }

    let parsedOutput;
    try {
      parsedOutput = FeedbackOutputSchema.parse(JSON.parse(stripFence(raw)));
    } catch (err) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        cacheHit: false,
        costEstimateUsd: null,
        result: jsonError(
          'UPSTREAM_FAILED',
          `Claude returned malformed feedback: ${err instanceof Error ? err.message : 'parse error'}`,
        ),
      });
    }

    try {
      await deps.insertCachedFeedback({
        card_id: attempt.card_id,
        error_pattern: errorPattern,
        native_language_code: nativeLangPrefix,
        feedback_text: parsedOutput.feedback_text,
      });
      await deps.updateAttemptFeedback(
        attempt.kind,
        attempt.id,
        parsedOutput.feedback_text,
      );
    } catch (err) {
      // Cache/update failure isn't fatal — the user still gets feedback this
      // call. Log + continue.
      deps.log({
        fn: 'generate-feedback',
        request_id: requestId,
        warn: 'cache/update failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const inputChars = prompt.system.length + prompt.user.length;
    const outputChars = parsedOutput.feedback_text.length;
    const costEstimateUsd = deps.estimateClaudeCostUsd(inputChars, outputChars);

    return finalize({
      deps,
      requestId,
      startedAt,
      userId: user.id,
      cacheHit: false,
      costEstimateUsd,
      result: jsonSuccess({
        feedback_text: parsedOutput.feedback_text,
        cached: false,
      }),
    });
  };
}

function computeErrorPattern(attempt: AttemptForFeedback): string {
  if (attempt.kind === 'comprehension') {
    const correct = attempt.correct ?? false;
    const responseMs = attempt.response_ms ?? 0;
    const speedBucket = responseMs < 4000 ? 'fast' : responseMs < 10000 ? 'mid' : 'slow';
    return `comp:${attempt.bucket}:${correct ? 'correct' : 'wrong'}:${speedBucket}`;
  }
  // Pronunciation: include a coarse similarity bucket.
  const sim = attempt.similarity_score ?? 0;
  const simBucket = sim >= 0.8 ? 'high' : sim >= 0.5 ? 'mid' : 'low';
  return `pron:${attempt.bucket}:${simBucket}`;
}

function finalize(args: {
  deps: HandlerDeps;
  requestId: string;
  startedAt: number;
  userId: string | null;
  cacheHit: boolean | null;
  costEstimateUsd: number | null;
  result: Response;
}): Response {
  const latency_ms = args.deps.now() - args.startedAt;
  args.deps.log({
    fn: 'generate-feedback',
    request_id: args.requestId,
    user_id: args.userId,
    status: args.result.status,
    latency_ms,
    cache_hit: args.cacheHit,
    cost_estimate_usd: args.costEstimateUsd,
  });
  return args.result;
}
