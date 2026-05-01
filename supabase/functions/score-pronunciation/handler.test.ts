/**
 * Deno tests for the score-pronunciation handler. Run with:
 *   deno test --allow-env supabase/functions/score-pronunciation/handler.test.ts
 *
 * The handler is a pure factory — every external dep is injected. No real
 * Supabase, no real OpenAI; tests stub each dep.
 */

import { assertEquals, assertExists } from 'std/assert';
import {
  createHandler,
  type AttemptRow,
  type CardForUser,
  type HandlerDeps,
  type TranscribeArgs,
} from './handler.ts';

const FAKE_USER = '00000000-0000-0000-0000-000000000aaa';
const FAKE_OTHER_USER = '00000000-0000-0000-0000-000000000bbb';
const FAKE_CARD = '00000000-0000-0000-0000-000000000ccc';
const FAKE_PATH = `${FAKE_USER}/${FAKE_CARD}/abc.webm`;
const FAKE_BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

function happyDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps & { __logs: object[] } {
  const logs: object[] = [];
  const base: HandlerDeps = {
    getUserFromJwt: (jwt: string): Promise<{ id: string } | null> =>
      Promise.resolve(jwt === 'good-jwt' ? { id: FAKE_USER } : null),
    getCardForUser: (cardId: string, jwt: string): Promise<CardForUser | null> =>
      Promise.resolve(
        cardId === FAKE_CARD && jwt === 'good-jwt'
          ? { id: FAKE_CARD, target_text: 'hola', language_code: 'es' }
          : null,
      ),
    downloadAudio: (_path: string): Promise<Blob | null> => Promise.resolve(FAKE_BLOB),
    transcribeAudio: (_args: TranscribeArgs): Promise<string> => Promise.resolve('hola'),
    insertAttempt: (_row: AttemptRow): Promise<{ id: string }> =>
      Promise.resolve({ id: '00000000-0000-0000-0000-00000000a111' }),
    now: () => Date.now(),
    log: (line: object) => {
      logs.push(line);
    },
  };
  return { ...base, ...overrides, __logs: logs };
}

function buildRequest(
  body: unknown,
  opts: { jwt?: string | null; method?: string } = {},
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.jwt !== null) {
    headers['Authorization'] = `Bearer ${opts.jwt ?? 'good-jwt'}`;
  }
  return new Request('http://localhost/score-pronunciation', {
    method: opts.method ?? 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test('OPTIONS preflight returns 204 with CORS headers', async () => {
  const handler = createHandler(happyDeps());
  const req = new Request('http://localhost/score-pronunciation', { method: 'OPTIONS' });
  const res = await handler(req);
  assertEquals(res.status, 204);
  assertExists(res.headers.get('Access-Control-Allow-Origin'));
});

Deno.test('returns 401 when Authorization header is missing', async () => {
  const handler = createHandler(happyDeps());
  const req = buildRequest({ card_id: FAKE_CARD, audio_storage_path: FAKE_PATH }, { jwt: null });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error.code, 'UNAUTHENTICATED');
});

Deno.test('returns 401 when JWT is rejected', async () => {
  const handler = createHandler(happyDeps());
  const req = buildRequest(
    { card_id: FAKE_CARD, audio_storage_path: FAKE_PATH },
    { jwt: 'bad-jwt' },
  );
  const res = await handler(req);
  assertEquals(res.status, 401);
});

Deno.test('returns 400 when body fails Zod parse', async () => {
  const handler = createHandler(happyDeps());
  const req = buildRequest({ card_id: 'not-a-uuid' });
  const res = await handler(req);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'INVALID_PAYLOAD');
});

Deno.test('returns 404 when card is not visible to the caller', async () => {
  const handler = createHandler(
    happyDeps({
      getCardForUser: async (_cardId, _jwt) => null,
    }),
  );
  const req = buildRequest({ card_id: FAKE_CARD, audio_storage_path: FAKE_PATH });
  const res = await handler(req);
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error.code, 'NOT_FOUND');
});

Deno.test('returns 403 FORBIDDEN_RESOURCE when audio path does not start with user_id', async () => {
  const handler = createHandler(happyDeps());
  const req = buildRequest({
    card_id: FAKE_CARD,
    audio_storage_path: `${FAKE_OTHER_USER}/${FAKE_CARD}/foo.webm`,
  });
  const res = await handler(req);
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error.code, 'FORBIDDEN_RESOURCE');
});

Deno.test('returns 403 for prefix-collision paths (would have passed startsWith)', async () => {
  // ${user_id}-other/... has the same `${user.id}` startsWith prefix as a
  // valid path, but the first path segment differs. Segment-anchored equality
  // catches it; the prior `startsWith` would have let it through if user-ids
  // ever lost their UUID prefix-collision-resistance.
  const handler = createHandler(happyDeps());
  const req = buildRequest({
    card_id: FAKE_CARD,
    audio_storage_path: `${FAKE_USER}-other/${FAKE_CARD}/foo.webm`,
  });
  const res = await handler(req);
  assertEquals(res.status, 403);
});

Deno.test('returns 403 when path has fewer than 3 segments', async () => {
  const handler = createHandler(happyDeps());
  const req = buildRequest({
    card_id: FAKE_CARD,
    audio_storage_path: `${FAKE_USER}/lone-segment.webm`,
  });
  const res = await handler(req);
  assertEquals(res.status, 403);
});

Deno.test('returns 504 when transcribeAudio aborts', async () => {
  const handler = createHandler(
    happyDeps({
      transcribeAudio: async () => {
        throw new DOMException('Timeout', 'AbortError');
      },
    }),
  );
  const req = buildRequest({ card_id: FAKE_CARD, audio_storage_path: FAKE_PATH });
  const res = await handler(req);
  assertEquals(res.status, 504);
  const body = await res.json();
  assertEquals(body.error.code, 'UPSTREAM_TIMEOUT');
});

Deno.test('returns 502 on generic Whisper failure', async () => {
  const handler = createHandler(
    happyDeps({
      transcribeAudio: async () => {
        throw new Error('OpenAI 500');
      },
    }),
  );
  const req = buildRequest({ card_id: FAKE_CARD, audio_storage_path: FAKE_PATH });
  const res = await handler(req);
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error.code, 'UPSTREAM_FAILED');
});

Deno.test('happy path — inserts attempt, computes similarity, logs', async () => {
  let transcribedLang = '';
  let inserted: Record<string, unknown> = {};
  const deps = happyDeps({
    transcribeAudio: async (args: TranscribeArgs) => {
      transcribedLang = args.language;
      return 'Hola.';
    },
    insertAttempt: async (row: AttemptRow) => {
      inserted = row as unknown as Record<string, unknown>;
      return { id: '00000000-0000-0000-0000-00000000a111' };
    },
    estimateWhisperCostUsd: (_size: number) => 0.0042,
  });
  const handler = createHandler(deps);
  const req = buildRequest({ card_id: FAKE_CARD, audio_storage_path: FAKE_PATH });
  const res = await handler(req);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.attempt_id, '00000000-0000-0000-0000-00000000a111');
  assertEquals(body.data.expected, 'hola');
  assertEquals(body.data.whisper_transcript, 'Hola.');
  // similarity("hola", "Hola.", { lang: 'es' }) — punctuation + casefold should yield ~0.8+
  assertEquals(typeof body.data.similarity_score, 'number');
  assertEquals(body.data.similarity_score >= 0.75, true);

  assertEquals(transcribedLang, 'es');
  assertEquals(inserted.user_id, FAKE_USER);
  assertEquals(inserted.card_id, FAKE_CARD);
  assertEquals(inserted.audio_storage_path, FAKE_PATH);

  const logs = (deps as unknown as { __logs: object[] }).__logs;
  assertEquals(logs.length, 1);
  const logLine = logs[0] as Record<string, unknown>;
  assertEquals(logLine.fn, 'score-pronunciation');
  assertEquals(logLine.user_id, FAKE_USER);
  assertEquals(logLine.status, 200);
  assertEquals(typeof logLine.latency_ms, 'number');
  assertEquals(typeof logLine.request_id, 'string');
  assertEquals(logLine.cost_estimate_usd, 0.0042);
});

Deno.test('error paths log cost_estimate_usd: null', async () => {
  const deps = happyDeps({
    getCardForUser: (_cardId: string, _jwt: string) => Promise.resolve(null),
    estimateWhisperCostUsd: (_size: number) => 0.0042,
  });
  const handler = createHandler(deps);
  const req = buildRequest({ card_id: FAKE_CARD, audio_storage_path: FAKE_PATH });
  await handler(req);

  const logs = (deps as unknown as { __logs: object[] }).__logs;
  const logLine = logs[0] as Record<string, unknown>;
  assertEquals(logLine.cost_estimate_usd, null);
});

Deno.test('returns 400 INVALID_PAYLOAD when audio blob exceeds the 10MB cap', async () => {
  const huge = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'audio/webm' });
  const handler = createHandler(
    happyDeps({ downloadAudio: (_p: string) => Promise.resolve(huge) }),
  );
  const req = buildRequest({ card_id: FAKE_CARD, audio_storage_path: FAKE_PATH });
  const res = await handler(req);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'INVALID_PAYLOAD');
});

Deno.test('logs and returns 502 when downloadAudio returns null', async () => {
  const handler = createHandler(
    happyDeps({
      downloadAudio: async () => null,
    }),
  );
  const req = buildRequest({ card_id: FAKE_CARD, audio_storage_path: FAKE_PATH });
  const res = await handler(req);
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error.code, 'UPSTREAM_FAILED');
});
