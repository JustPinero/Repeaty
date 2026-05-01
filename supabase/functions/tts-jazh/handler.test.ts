/**
 * Deno tests for `tts-jazh` — Pro/admin-only OpenAI TTS proxy for ja/zh.
 * Browser SpeechSynthesis quality is inconsistent for those two languages
 * (per ADR-004); this Edge Function is the Pro-tier upgrade path.
 */

import { assertEquals, assertExists } from 'std/assert';
import { createHandler, type HandlerDeps } from './handler.ts';

const FAKE_USER = '00000000-0000-0000-0000-000000000aaa';

function happyDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps & { __logs: object[] } {
  const logs: object[] = [];
  const audioBytes = new Uint8Array([0xff, 0xfb, 0x90, 0x44]); // synthetic mp3 header bytes
  const base: HandlerDeps = {
    getUserFromJwt: (jwt: string) =>
      Promise.resolve(jwt === 'good-jwt' ? { id: FAKE_USER } : null),
    getProfile: (_userId: string) =>
      Promise.resolve({ tier: 'pro' as const }),
    bumpRateLimit: (_bucket: string, _cap: number) => Promise.resolve(1),
    callOpenAITts: (_args: { text: string; voice: string; signal: AbortSignal }) =>
      Promise.resolve(audioBytes.buffer),
    estimateTtsCostUsd: (chars: number) => chars * 0.000015,
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
  return new Request('http://localhost/tts-jazh', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test('OPTIONS preflight returns 204', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    new Request('http://localhost/tts-jazh', { method: 'OPTIONS' }),
  );
  assertEquals(res.status, 204);
});

Deno.test('returns 401 when JWT missing', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    buildRequest({ text: 'こんにちは', lang: 'ja' }, { jwt: null }),
  );
  assertEquals(res.status, 401);
});

Deno.test('returns 403 FORBIDDEN_TIER for free callers', async () => {
  const handler = createHandler(
    happyDeps({
      getProfile: () => Promise.resolve({ tier: 'free' as const }),
    }),
  );
  const res = await handler(buildRequest({ text: 'こんにちは', lang: 'ja' }));
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error.code, 'FORBIDDEN_TIER');
});

Deno.test('returns 400 for malformed body', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(buildRequest({ text: 'hello' })); // missing lang
  assertEquals(res.status, 400);
});

Deno.test('returns 400 for unsupported lang (only ja/zh allowed)', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(buildRequest({ text: 'hola', lang: 'es' }));
  assertEquals(res.status, 400);
});

Deno.test('returns 400 when text exceeds 200-char cap', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    buildRequest({ text: 'ち'.repeat(201), lang: 'ja' }),
  );
  assertEquals(res.status, 400);
});

Deno.test('happy path — audio/mpeg blob bytes returned + log line', async () => {
  const deps = happyDeps();
  const handler = createHandler(deps);
  const res = await handler(buildRequest({ text: 'こんにちは', lang: 'ja' }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Content-Type'), 'audio/mpeg');
  const buf = await res.arrayBuffer();
  assertEquals(new Uint8Array(buf).length, 4);

  const logs = (deps as unknown as { __logs: object[] }).__logs;
  const line = logs[0] as Record<string, unknown>;
  assertEquals(line.fn, 'tts-jazh');
  assertEquals(line.user_id, FAKE_USER);
  assertEquals(line.status, 200);
  assertEquals(line.lang, 'ja');
  assertExists(line.cost_estimate_usd);
});

Deno.test('selects ja voice for lang=ja, zh voice for lang=zh', async () => {
  const seenVoices: string[] = [];
  const handler = createHandler(
    happyDeps({
      callOpenAITts: ({ voice }) => {
        seenVoices.push(voice);
        return Promise.resolve(new Uint8Array([1]).buffer);
      },
    }),
  );
  await handler(buildRequest({ text: 'こんにちは', lang: 'ja' }));
  await handler(buildRequest({ text: '你好', lang: 'zh' }));
  // Two distinct voices.
  assertEquals(seenVoices.length, 2);
  assertEquals(seenVoices[0] !== seenVoices[1], true);
});

Deno.test('OpenAI AbortError → 504 UPSTREAM_TIMEOUT', async () => {
  const handler = createHandler(
    happyDeps({
      callOpenAITts: () => {
        throw new DOMException('Timeout', 'AbortError');
      },
    }),
  );
  const res = await handler(buildRequest({ text: 'こんにちは', lang: 'ja' }));
  assertEquals(res.status, 504);
});

Deno.test('OpenAI 5xx → 502 UPSTREAM_FAILED', async () => {
  const handler = createHandler(
    happyDeps({
      callOpenAITts: () => {
        throw new Error('OpenAI 503');
      },
    }),
  );
  const res = await handler(buildRequest({ text: 'こんにちは', lang: 'ja' }));
  assertEquals(res.status, 502);
});

Deno.test('rate-limit raise → 429', async () => {
  const handler = createHandler(
    happyDeps({
      bumpRateLimit: () => Promise.reject(new Error('RATE_LIMITED: 101 exceeded cap 100')),
    }),
  );
  const res = await handler(buildRequest({ text: 'こんにちは', lang: 'ja' }));
  assertEquals(res.status, 429);
});
