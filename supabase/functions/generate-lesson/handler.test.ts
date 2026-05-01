import { assertEquals, assertExists } from 'std/assert';
import { createHandler, type HandlerDeps } from './handler.ts';

const FAKE_USER = '00000000-0000-0000-0000-000000000aaa';
const FAKE_DECK_ID = '00000000-0000-0000-0000-000000000ddd';

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
    getUserLanguage: (_userId: string, _languageCode: string) =>
      Promise.resolve({ cefr_level: 'A1' as const }),
    getRecentWeakWords: (_userId: string, _languageCode: string, _limit: number) =>
      Promise.resolve(['casa', 'comer']),
    bumpRateLimit: (_bucket: string, _cap: number) => Promise.resolve(1),
    callClaude: (_args: { system: string; user: string; signal: AbortSignal }) =>
      Promise.resolve(
        JSON.stringify({
          deck_name: 'Spanish food basics',
          cards: Array.from({ length: 12 }, (_, i) => ({
            target_text: `palabra-${i}`,
            native_text: `word-${i}`,
          })),
        }),
      ),
    insertDeckWithCards: (
      _ownerId: string,
      _language: string,
      _cefr: string,
      _deckName: string,
      _cards: unknown[],
    ) => Promise.resolve(FAKE_DECK_ID),
    estimateClaudeCostUsd: (_inputChars: number, _outputChars: number) => 0.0042,
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
  return new Request('http://localhost/generate-lesson', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test('OPTIONS preflight returns 204', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    new Request('http://localhost/generate-lesson', { method: 'OPTIONS' }),
  );
  assertEquals(res.status, 204);
});

Deno.test('returns 401 when JWT missing', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(buildRequest({ language_code: 'es' }, { jwt: null }));
  assertEquals(res.status, 401);
});

Deno.test('returns 403 FORBIDDEN_TIER for free callers', async () => {
  const handler = createHandler(
    happyDeps({
      getProfile: () =>
        Promise.resolve({ tier: 'free' as const, native_language_code: 'en-US' }),
    }),
  );
  const res = await handler(buildRequest({ language_code: 'es' }));
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error.code, 'FORBIDDEN_TIER');
});

Deno.test('returns 400 for malformed body / unknown language', async () => {
  const handler = createHandler(
    happyDeps({ getUserLanguage: () => Promise.resolve(null) }),
  );
  const res = await handler(buildRequest({ language_code: 'zz' }));
  assertEquals(res.status, 400);
});

Deno.test('caps topic_hint at 200 chars (Zod-side reject)', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    buildRequest({ language_code: 'es', topic_hint: 'x'.repeat(201) }),
  );
  assertEquals(res.status, 400);
});

Deno.test('clamps card_count into [5, 25] when Claude returns the right number', async () => {
  let claudeUserPrompt = '';
  const handler = createHandler(
    happyDeps({
      callClaude: ({ user }) => {
        claudeUserPrompt = user;
        return Promise.resolve(
          JSON.stringify({
            deck_name: 'tiny deck',
            cards: Array.from({ length: 5 }, (_, i) => ({
              target_text: `t${i}`,
              native_text: `n${i}`,
            })),
          }),
        );
      },
    }),
  );
  const res = await handler(
    buildRequest({ language_code: 'es', card_count: 1 }),
  );
  assertEquals(res.status, 200);
  // The handler clamps before passing to Claude.
  assertEquals(/Generate exactly 5 flashcards\./.test(claudeUserPrompt), true);
});

Deno.test('happy path — invokes Claude, inserts deck, returns deck_id', async () => {
  let claudeCalls = 0;
  let inserted: { ownerId: string; cards: unknown[] } | null = null;
  const deps = happyDeps({
    callClaude: () => {
      claudeCalls += 1;
      return Promise.resolve(
        JSON.stringify({
          deck_name: 'Greetings & basics',
          cards: Array.from({ length: 8 }, (_, i) => ({
            target_text: `t${i}`,
            native_text: `n${i}`,
          })),
        }),
      );
    },
    insertDeckWithCards: (ownerId, _l, _c, _n, cards) => {
      inserted = { ownerId, cards };
      return Promise.resolve(FAKE_DECK_ID);
    },
  });
  const handler = createHandler(deps);
  const res = await handler(buildRequest({ language_code: 'es', card_count: 8 }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.deck_id, FAKE_DECK_ID);
  assertEquals(body.data.deck_name, 'Greetings & basics');
  assertEquals(body.data.card_count, 8);
  assertEquals(claudeCalls, 1);
  assertEquals(inserted!.ownerId, FAKE_USER);
  assertEquals(inserted!.cards.length, 8);

  const logs = (deps as unknown as { __logs: object[] }).__logs;
  const line = logs[0] as Record<string, unknown>;
  assertEquals(line.fn, 'generate-lesson');
  assertEquals(line.user_id, FAKE_USER);
  assertEquals(line.status, 200);
  assertEquals(typeof line.cost_estimate_usd, 'number');
  assertExists(line.latency_ms);
});

Deno.test('strips markdown fences before JSON.parse', async () => {
  const handler = createHandler(
    happyDeps({
      callClaude: () =>
        Promise.resolve(
          '```json\n' +
            JSON.stringify({
              deck_name: 'fenced',
              cards: Array.from({ length: 5 }, (_, i) => ({
                target_text: `t${i}`,
                native_text: `n${i}`,
              })),
            }) +
            '\n```',
        ),
    }),
  );
  const res = await handler(buildRequest({ language_code: 'es' }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.deck_name, 'fenced');
});

Deno.test('Claude AbortError → 504 UPSTREAM_TIMEOUT', async () => {
  const handler = createHandler(
    happyDeps({
      callClaude: () => {
        throw new DOMException('Timeout', 'AbortError');
      },
    }),
  );
  const res = await handler(buildRequest({ language_code: 'es' }));
  assertEquals(res.status, 504);
});

Deno.test('Claude returns malformed JSON → 502 UPSTREAM_FAILED', async () => {
  const handler = createHandler(
    happyDeps({
      callClaude: () => Promise.resolve('not json'),
    }),
  );
  const res = await handler(buildRequest({ language_code: 'es' }));
  assertEquals(res.status, 502);
});

Deno.test('Claude returns Zod-invalid output → 502', async () => {
  const handler = createHandler(
    happyDeps({
      callClaude: () =>
        Promise.resolve(JSON.stringify({ deck_name: 'oops', cards: [] })),
    }),
  );
  const res = await handler(buildRequest({ language_code: 'es' }));
  assertEquals(res.status, 502);
});

Deno.test('rate-limit raise → 429', async () => {
  const handler = createHandler(
    happyDeps({
      bumpRateLimit: () => Promise.reject(new Error('RATE_LIMITED: 11 exceeded cap 10')),
    }),
  );
  const res = await handler(buildRequest({ language_code: 'es' }));
  assertEquals(res.status, 429);
});
