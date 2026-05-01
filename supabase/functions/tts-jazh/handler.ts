/**
 * `tts-jazh` Edge Function — Pro/admin-only TTS proxy for Japanese and
 * Mandarin Chinese. Browser SpeechSynthesis quality for ja/zh is
 * inconsistent (ADR-004); this Edge Function is the Pro-tier upgrade
 * path. Daily cap 100 / user / day on the `tts_jazh` rate-limit bucket.
 *
 * Activates DEBT-003.
 */

import { z } from 'zod';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError } from '../_shared/error.ts';

const RequestSchema = z.object({
  text: z.string().min(1).max(200),
  lang: z.enum(['ja', 'zh']),
});
type RequestBody = z.infer<typeof RequestSchema>;

const TTS_DAILY_CAP = 100;
const OPENAI_TIMEOUT_MS = 15_000;

export type Profile = {
  tier: 'free' | 'pro' | 'admin';
};

export type HandlerDeps = {
  getUserFromJwt(jwt: string): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<Profile | null>;
  bumpRateLimit(bucket: string, cap: number): Promise<number>;
  callOpenAITts(args: {
    text: string;
    voice: string;
    signal: AbortSignal;
  }): Promise<ArrayBuffer>;
  estimateTtsCostUsd(chars: number): number;
  now(): number;
  log(line: object): void;
};

const VOICE_BY_LANG: Record<RequestBody['lang'], string> = {
  // OpenAI's `tts-1` doesn't have lang-locked voices; pick contrasting
  // tones so the JA voice is distinct from the ZH voice for users who
  // study both. Production wiring overrides via env vars
  // OPENAI_TTS_VOICE_JA / OPENAI_TTS_VOICE_ZH.
  ja: 'shimmer',
  zh: 'nova',
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
        lang: null,
        costEstimateUsd: null,
        result: jsonError('INVALID_PAYLOAD', 'Only POST is supported'),
      });
    }

    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: null,
        lang: null,
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
        lang: null,
        costEstimateUsd: null,
        result: jsonError('UNAUTHENTICATED', 'Invalid JWT'),
      });
    }

    // ── Body parse ─────────────────────────────────────────────────────────
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
          lang: null,
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
        lang: null,
        costEstimateUsd: null,
        result: jsonError(
          'INVALID_PAYLOAD',
          err instanceof Error ? err.message : 'invalid JSON',
        ),
      });
    }

    // ── Tier gate ──────────────────────────────────────────────────────────
    const profile = await deps.getProfile(user.id);
    if (!profile) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        lang: parsed.lang,
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
        lang: parsed.lang,
        costEstimateUsd: null,
        result: jsonError('FORBIDDEN_TIER', 'TTS for ja/zh requires Pro tier'),
      });
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    try {
      await deps.bumpRateLimit('tts_jazh', TTS_DAILY_CAP);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'rate limit error';
      if (/RATE_LIMITED/.test(msg)) {
        return finalize({
          deps,
          requestId,
          startedAt,
          userId: user.id,
          lang: parsed.lang,
          costEstimateUsd: null,
          result: jsonError('RATE_LIMITED', msg),
        });
      }
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        lang: parsed.lang,
        costEstimateUsd: null,
        result: jsonError('INTERNAL', msg),
      });
    }

    // ── OpenAI TTS call ────────────────────────────────────────────────────
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    let audioBuffer: ArrayBuffer;
    try {
      audioBuffer = await deps.callOpenAITts({
        text: parsed.text,
        voice: VOICE_BY_LANG[parsed.lang],
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
        lang: parsed.lang,
        costEstimateUsd: null,
        result: jsonError(
          code,
          err instanceof Error ? err.message : 'OpenAI TTS call failed',
        ),
      });
    } finally {
      clearTimeout(timer);
    }

    const costEstimateUsd = deps.estimateTtsCostUsd(parsed.text.length);

    // Audio blob is binary, not JSON — return raw bytes with audio/mpeg.
    const headers = new Headers({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
      // Same CORS shape as the JSON helpers.
      'Access-Control-Allow-Origin': '*',
    });
    const successResponse = new Response(audioBuffer, { status: 200, headers });

    return finalize({
      deps,
      requestId,
      startedAt,
      userId: user.id,
      lang: parsed.lang,
      costEstimateUsd,
      result: successResponse,
    });
  };
}

function finalize(args: {
  deps: HandlerDeps;
  requestId: string;
  startedAt: number;
  userId: string | null;
  lang: string | null;
  costEstimateUsd: number | null;
  result: Response;
}): Response {
  const latency_ms = args.deps.now() - args.startedAt;
  args.deps.log({
    fn: 'tts-jazh',
    request_id: args.requestId,
    user_id: args.userId,
    status: args.result.status,
    latency_ms,
    lang: args.lang,
    cost_estimate_usd: args.costEstimateUsd,
  });
  return args.result;
}
