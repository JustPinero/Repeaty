/**
 * Deno tests for the score-pronunciation handler. Run with:
 *   deno test --allow-env supabase/functions/score-pronunciation/handler.test.ts
 *
 * The handler is a pure factory — every external dep is injected. No real
 * Supabase, no real OpenAI; tests stub each dep.
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createHandler, type HandlerDeps } from './handler.ts';

const FAKE_USER = '00000000-0000-0000-0000-000000000aaa';
const FAKE_OTHER_USER = '00000000-0000-0000-0000-000000000bbb';
const FAKE_CARD = '00000000-0000-0000-0000-000000000ccc';
const FAKE_PATH = `${FAKE_USER}/${FAKE_CARD}/abc.webm`;
const FAKE_BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

function happyDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  const logs: object[] = [];
  return {
    getUserFromJwt: async (jwt: string) =>
      jwt === 'good-jwt' ? { id: FAKE_USER } : null,
    getCardForUser: async (cardId, jwt) =>
      cardId === FAKE_CARD && jwt === 'good-jwt'
        ? {
            id: FAKE_CARD,
            target_text: 'hola',
            language_code: 'es',
          }
        : null,
    downloadAudio: async (_path) => FAKE_BLOB,
    transcribeAudio: async (_args) => 'hola',
    insertAttempt: async (_row) => ({
      id: '00000000-0000-0000-0000-00000000a111',
    }),
    now: () => Date.now(),
    log: (line: object) => {
      logs.push(line);
    },
    ...overrides,
    // Expose the captured logs for assertions
    __logs: logs,
  } as unknown as HandlerDeps;
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

Deno.test('returns 403 when audio path does not start with user_id', async () => {
  const handler = createHandler(happyDeps());
  const req = buildRequest({
    card_id: FAKE_CARD,
    audio_storage_path: `${FAKE_OTHER_USER}/${FAKE_CARD}/foo.webm`,
  });
  const res = await handler(req);
  assertEquals(res.status, 403);
  const body = await res.json();
  // FORBIDDEN_TIER is the closest semantic match in the shared enum even though
  // this is path-traversal, not tier — handler maps to it deliberately.
  assertEquals(body.error.code, 'FORBIDDEN_TIER');
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
    transcribeAudio: async (args) => {
      transcribedLang = args.language;
      return 'Hola.';
    },
    insertAttempt: async (row) => {
      inserted = row as unknown as Record<string, unknown>;
      return { id: '00000000-0000-0000-0000-00000000a111' };
    },
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
