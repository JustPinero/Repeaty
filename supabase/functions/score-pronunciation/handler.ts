/**
 * `score-pronunciation` Edge Function — pure handler factory.
 *
 * The factory takes injected deps so the Deno tests can stub Supabase + OpenAI
 * cleanly. The real `index.ts` wires up the production deps (service-role
 * client, OpenAI Whisper, structured stdout log).
 *
 * Wire contract: `references/api-contracts.md` § score-pronunciation.
 */

import { z } from 'zod';
import { similarity } from '../../../packages/shared/src/similarity.ts';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonSuccess } from '../_shared/error.ts';

const RequestSchema = z.object({
  card_id: z.string().uuid(),
  audio_storage_path: z.string().min(1).max(512),
});

type RequestBody = z.infer<typeof RequestSchema>;

export type CardForUser = {
  id: string;
  target_text: string;
  language_code: string;
};

export type TranscribeArgs = {
  audio: Blob;
  language: string;
  signal: AbortSignal;
};

export type AttemptRow = {
  user_id: string;
  card_id: string;
  audio_storage_path: string;
  whisper_transcript: string;
  similarity_score: number;
};

export type HandlerDeps = {
  getUserFromJwt(jwt: string): Promise<{ id: string } | null>;
  getCardForUser(cardId: string, jwt: string): Promise<CardForUser | null>;
  downloadAudio(path: string): Promise<Blob | null>;
  transcribeAudio(args: TranscribeArgs): Promise<string>;
  insertAttempt(row: AttemptRow): Promise<{ id: string }>;
  now(): number;
  log(line: object): void;
};

const TRANSCRIBE_TIMEOUT_MS = 15_000;

export function createHandler(deps: HandlerDeps) {
  return async function handler(req: Request): Promise<Response> {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;

    const startedAt = deps.now();
    const requestId = crypto.randomUUID();

    if (req.method !== 'POST') {
      return jsonError('INVALID_PAYLOAD', 'Only POST is supported', {
        latency_ms: deps.now() - startedAt,
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
        result: jsonError('UNAUTHENTICATED', 'Invalid JWT'),
      });
    }

    // ── Body parse ─────────────────────────────────────────────────────────
    let parsed: RequestBody;
    try {
      const raw = (await req.json()) as unknown;
      const out = RequestSchema.safeParse(raw);
      if (!out.success) {
        const issues = out.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        return finalize({
          deps,
          requestId,
          startedAt,
          userId: user.id,
          result: jsonError('INVALID_PAYLOAD', issues),
        });
      }
      parsed = out.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'invalid JSON';
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        result: jsonError('INVALID_PAYLOAD', msg),
      });
    }

    // ── Card visibility (RLS-respecting) ──────────────────────────────────
    const card = await deps.getCardForUser(parsed.card_id, jwt);
    if (!card) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        result: jsonError('NOT_FOUND', 'Card not found or not accessible'),
      });
    }

    // ── Path-prefix guard (defense in depth — bucket RLS already blocks
    //    cross-user *uploads*; this stops a malicious client from tricking the
    //    Edge Function into transcribing someone else's audio via service-role
    //    download). ─────────────────────────────────────────────────────────
    if (!parsed.audio_storage_path.startsWith(`${user.id}/`)) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        result: jsonError(
          'FORBIDDEN_TIER',
          'audio_storage_path must start with the caller user_id',
        ),
      });
    }

    // ── Audio download ────────────────────────────────────────────────────
    const audio = await deps.downloadAudio(parsed.audio_storage_path);
    if (!audio) {
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        result: jsonError('UPSTREAM_FAILED', 'Failed to download audio'),
      });
    }

    // ── Whisper transcription, 15s AbortController ────────────────────────
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
    let transcript: string;
    try {
      transcript = await deps.transcribeAudio({
        audio,
        language: card.language_code,
        signal: controller.signal,
      });
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          /aborted|timeout/i.test(err.message));
      const code = isAbort ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILED';
      const msg = err instanceof Error ? err.message : 'transcription failed';
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        result: jsonError(code, msg),
      });
    } finally {
      clearTimeout(timer);
    }

    // ── Similarity + insert ───────────────────────────────────────────────
    const similarityScore = similarity(card.target_text, transcript, {
      lang: card.language_code,
    });

    const row: AttemptRow = {
      user_id: user.id,
      card_id: card.id,
      audio_storage_path: parsed.audio_storage_path,
      whisper_transcript: transcript,
      similarity_score: similarityScore,
    };

    let inserted: { id: string };
    try {
      inserted = await deps.insertAttempt(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'db insert failed';
      return finalize({
        deps,
        requestId,
        startedAt,
        userId: user.id,
        result: jsonError('INTERNAL', msg),
      });
    }

    return finalize({
      deps,
      requestId,
      startedAt,
      userId: user.id,
      result: jsonSuccess({
        attempt_id: inserted.id,
        whisper_transcript: transcript,
        similarity_score: similarityScore,
        expected: card.target_text,
      }),
    });
  };
}

function finalize(args: {
  deps: HandlerDeps;
  requestId: string;
  startedAt: number;
  userId: string | null;
  result: Response;
}): Response {
  const latency_ms = args.deps.now() - args.startedAt;
  args.deps.log({
    fn: 'score-pronunciation',
    request_id: args.requestId,
    user_id: args.userId,
    status: args.result.status,
    latency_ms,
  });
  return args.result;
}
