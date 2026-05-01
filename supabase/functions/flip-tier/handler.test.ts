import { assertEquals, assertExists } from 'std/assert';
import { createHandler, type HandlerDeps } from './handler.ts';

const FAKE_ACTOR = '00000000-0000-0000-0000-000000000aaa';
const FAKE_TARGET = '00000000-0000-0000-0000-000000000bbb';
const FAKE_LOG_ID = '00000000-0000-0000-0000-000000000ccc';

function happyDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps & { __logs: object[] } {
  const logs: object[] = [];
  const base: HandlerDeps = {
    getUserFromJwt: (jwt: string) =>
      Promise.resolve(jwt === 'good-jwt' ? { id: FAKE_ACTOR } : null),
    callFlipTier: (
      _actorJwt: string,
      _targetId: string,
      _newTier: string,
      _reason: string | null,
    ) => Promise.resolve({ logId: FAKE_LOG_ID, error: null }),
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
  return new Request('http://localhost/flip-tier', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test('OPTIONS preflight returns 204', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    new Request('http://localhost/flip-tier', { method: 'OPTIONS' }),
  );
  assertEquals(res.status, 204);
});

Deno.test('returns 401 when JWT is missing', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    buildRequest({ target_user_id: FAKE_TARGET, new_tier: 'pro' }, { jwt: null }),
  );
  assertEquals(res.status, 401);
});

Deno.test('returns 401 when JWT is invalid', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    buildRequest({ target_user_id: FAKE_TARGET, new_tier: 'pro' }, { jwt: 'bad' }),
  );
  assertEquals(res.status, 401);
});

Deno.test('returns 400 INVALID_PAYLOAD when body fails Zod parse', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(buildRequest({ target_user_id: 'not-a-uuid' }));
  assertEquals(res.status, 400);
});

Deno.test('returns 400 when new_tier is not in {free,pro,admin}', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    buildRequest({ target_user_id: FAKE_TARGET, new_tier: 'super_pro' }),
  );
  assertEquals(res.status, 400);
});

Deno.test('happy path — returns 200 with log_id and emits a structured log line', async () => {
  const deps = happyDeps();
  const handler = createHandler(deps);
  const res = await handler(
    buildRequest({
      target_user_id: FAKE_TARGET,
      new_tier: 'pro',
      reason: 'beta access',
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.log_id, FAKE_LOG_ID);

  const logs = (deps as unknown as { __logs: object[] }).__logs;
  assertEquals(logs.length, 1);
  const line = logs[0] as Record<string, unknown>;
  assertEquals(line.fn, 'flip-tier');
  assertEquals(line.actor_id, FAKE_ACTOR);
  assertEquals(line.status, 200);
  assertExists(line.latency_ms);
});

Deno.test('NOT_ADMIN from RPC → 403 FORBIDDEN_TIER', async () => {
  const handler = createHandler(
    happyDeps({
      callFlipTier: () => Promise.resolve({ logId: null, error: 'NOT_ADMIN' }),
    }),
  );
  const res = await handler(
    buildRequest({ target_user_id: FAKE_TARGET, new_tier: 'pro' }),
  );
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error.code, 'FORBIDDEN_TIER');
});

Deno.test('SELF_FLIP_FORBIDDEN from RPC → 403 FORBIDDEN_RESOURCE', async () => {
  const handler = createHandler(
    happyDeps({
      callFlipTier: () => Promise.resolve({ logId: null, error: 'SELF_FLIP_FORBIDDEN' }),
    }),
  );
  const res = await handler(
    buildRequest({ target_user_id: FAKE_ACTOR, new_tier: 'free' }),
  );
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error.code, 'FORBIDDEN_RESOURCE');
});

Deno.test('TARGET_NOT_FOUND from RPC → 404 NOT_FOUND', async () => {
  const handler = createHandler(
    happyDeps({
      callFlipTier: () => Promise.resolve({ logId: null, error: 'TARGET_NOT_FOUND' }),
    }),
  );
  const res = await handler(
    buildRequest({ target_user_id: FAKE_TARGET, new_tier: 'pro' }),
  );
  assertEquals(res.status, 404);
});

Deno.test('NO_CHANGE / INVALID_TIER from RPC → 400', async () => {
  const handler = createHandler(
    happyDeps({
      callFlipTier: () => Promise.resolve({ logId: null, error: 'NO_CHANGE' }),
    }),
  );
  const res = await handler(
    buildRequest({ target_user_id: FAKE_TARGET, new_tier: 'pro' }),
  );
  assertEquals(res.status, 400);
});
