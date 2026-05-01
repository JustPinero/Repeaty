import { assertEquals, assertExists } from 'std/assert';
import { createHandler, type HandlerDeps, type AttemptForFeedback } from './handler.ts';

const FAKE_USER = '00000000-0000-0000-0000-000000000aaa';
const FAKE_ATTEMPT = '00000000-0000-0000-0000-000000000ccc';

const ATTEMPT_DATA: AttemptForFeedback = {
  id: FAKE_ATTEMPT,
  card_id: '00000000-0000-0000-0000-000000000ddd',
  card_target_text: 'hola',
  card_native_text: 'hello',
  card_language_code: 'es',
  similarity_score: 0.4,
  whisper_transcript: 'olla',
  bucket: 'miss',
  kind: 'pronunciation',
};

function happyDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps & { __logs: object[] } {
  const logs: object[] = [];
  const base: HandlerDeps = {
    getUserFromJwt: (jwt: string) =>
      Promise.resolve(jwt === 'good-jwt' ? { id: FAKE_USER } : null),
    getProfile: (_userId: string) =>
      Promise.resolve({
        tier: 'pro' as const,
        native_language_code: 'en-US',
      }),
    getCefrForLanguage: (_userId: string, _lang: string) =>
      Promise.resolve('A1' as const),
    getAttempt: (_kind: 'comprehension' | 'pronunciation', _attemptId: string, _jwt: string) =>
      Promise.resolve(ATTEMPT_DATA),
    getCachedFeedback: (
      _cardId: string,
      _errorPattern: string,
      _nativeLang: string,
    ) => Promise.resolve(null),
    insertCachedFeedback: (_row: {
      card_id: string;
      error_pattern: string;
      native_language_code: string;
      feedback_text: string;
    }) => Promise.resolve(),
    updateAttemptFeedback: (
      _kind: 'comprehension' | 'pronunciation',
      _attemptId: string,
      _text: string,
    ) => Promise.resolve(),
    bumpRateLimit: (_bucket: string, _cap: number) => Promise.resolve(1),
    callClaude: (_args: { system: string; user: string; signal: AbortSignal }) =>
      Promise.resolve(
        JSON.stringify({ feedback_text: 'Try emphasising the "h" sound at the start.' }),
      ),
    estimateClaudeCostUsd: (_inputChars: number, _outputChars: number) => 0.0008,
    now: () => Date.now(),
    log: (line: object) => {
      logs.push(line);
    },
  };
  return { ...base, ...overrides, __logs: logs };
}

function buildRequest(body: unknown, opts: { jwt?: string | null } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.jwt !== null) {
    headers['Authorization'] = `Bearer ${opts.jwt ?? 'good-jwt'}`;
  }
  return new Request('http://localhost/generate-feedback', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test('OPTIONS preflight returns 204', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    new Request('http://localhost/generate-feedback', { method: 'OPTIONS' }),
  );
  assertEquals(res.status, 204);
});

Deno.test('returns 401 when JWT missing', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }, { jwt: null }),
  );
  assertEquals(res.status, 401);
});

Deno.test('returns 403 FORBIDDEN_TIER for free-tier callers', async () => {
  const handler = createHandler(
    happyDeps({
      getProfile: () =>
        Promise.resolve({
          tier: 'free' as const,
          native_language_code: 'en-US',
        }),
    }),
  );
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }),
  );
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error.code, 'FORBIDDEN_TIER');
});

Deno.test('returns 400 for malformed body', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(buildRequest({ kind: 'invalid' }));
  assertEquals(res.status, 400);
});

Deno.test('returns 404 when attempt not visible to caller', async () => {
  const handler = createHandler(
    happyDeps({ getAttempt: () => Promise.resolve(null) }),
  );
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }),
  );
  assertEquals(res.status, 404);
});

Deno.test('returns 400 for perfect-bucket attempts (no feedback needed)', async () => {
  const handler = createHandler(
    happyDeps({
      getAttempt: () =>
        Promise.resolve({ ...ATTEMPT_DATA, bucket: 'perfect' }),
    }),
  );
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }),
  );
  assertEquals(res.status, 400);
});

Deno.test('returns cached feedback without calling Claude', async () => {
  let claudeCalls = 0;
  const handler = createHandler(
    happyDeps({
      getCachedFeedback: () => Promise.resolve('Cached: try the second syllable.'),
      callClaude: () => {
        claudeCalls += 1;
        return Promise.resolve('{"feedback_text":"never called"}');
      },
    }),
  );
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.feedback_text, 'Cached: try the second syllable.');
  assertEquals(body.data.cached, true);
  assertEquals(claudeCalls, 0);
});

Deno.test('cache miss → calls Claude, persists cache, updates attempt', async () => {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const deps = happyDeps({
    insertCachedFeedback: (row) => {
      inserts.push(row as unknown as Record<string, unknown>);
      return Promise.resolve();
    },
    updateAttemptFeedback: (kind, attemptId, text) => {
      updates.push({ kind, attemptId, text });
      return Promise.resolve();
    },
  });
  const handler = createHandler(deps);
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.cached, false);
  assertEquals(body.data.feedback_text, 'Try emphasising the "h" sound at the start.');
  assertEquals(inserts.length, 1);
  assertEquals(updates.length, 1);
  assertEquals(updates[0]?.attemptId, FAKE_ATTEMPT);

  const logs = (deps as unknown as { __logs: object[] }).__logs;
  const line = logs[0] as Record<string, unknown>;
  assertEquals(line.fn, 'generate-feedback');
  assertEquals(line.cache_hit, false);
  assertEquals(line.cost_estimate_usd, 0.0008);
  assertExists(line.latency_ms);
});

Deno.test('strips markdown fences before JSON.parse', async () => {
  const handler = createHandler(
    happyDeps({
      callClaude: () =>
        Promise.resolve('```json\n{"feedback_text":"With fences"}\n```'),
    }),
  );
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.feedback_text, 'With fences');
});

Deno.test('Claude AbortError → 504 UPSTREAM_TIMEOUT', async () => {
  const handler = createHandler(
    happyDeps({
      callClaude: () => {
        throw new DOMException('Timeout', 'AbortError');
      },
    }),
  );
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }),
  );
  assertEquals(res.status, 504);
});

Deno.test('Claude returns malformed JSON → 502 UPSTREAM_FAILED', async () => {
  const handler = createHandler(
    happyDeps({
      callClaude: () => Promise.resolve('not json at all'),
    }),
  );
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }),
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error.code, 'UPSTREAM_FAILED');
});

Deno.test('rate-limit raise → 429 RATE_LIMITED', async () => {
  const handler = createHandler(
    happyDeps({
      bumpRateLimit: () => Promise.reject(new Error('RATE_LIMITED: 26 exceeded cap 25')),
    }),
  );
  const res = await handler(
    buildRequest({ kind: 'pronunciation', attempt_id: FAKE_ATTEMPT }),
  );
  assertEquals(res.status, 429);
});
