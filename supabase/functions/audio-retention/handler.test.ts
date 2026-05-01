/**
 * Deno tests for the `audio-retention` Edge Function. The function is
 * service-role-only (called by Supabase Cron, not by browsers) so the
 * handler-factory's auth check just verifies the caller's JWT belongs to a
 * user with `is_admin = true` OR is a service-role key. For the v1
 * single-user beta the simpler shape is "service-role only" — the function
 * is invoked by Cron, not by the user, so we just check the apikey header
 * matches `SUPABASE_SERVICE_ROLE_KEY`.
 */

import { assertEquals } from 'std/assert';
import { createHandler, type HandlerDeps, type StaleAttempt } from './handler.ts';

const FAKE_USER_A = '00000000-0000-0000-0000-000000000aaa';
const FAKE_USER_B = '00000000-0000-0000-0000-000000000bbb';

function happyDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps & { __logs: object[] } {
  const logs: object[] = [];
  const base: HandlerDeps = {
    isAuthorizedServiceRole: (apikey: string) => apikey === 'service-role-key',
    getStaleFreeAudio: () =>
      Promise.resolve([
        { id: 'att-1', user_id: FAKE_USER_A, audio_storage_path: `${FAKE_USER_A}/c1/x.webm` },
        { id: 'att-2', user_id: FAKE_USER_B, audio_storage_path: `${FAKE_USER_B}/c2/y.webm` },
      ]),
    removeStorageObjects: (_paths: string[]) =>
      Promise.resolve({ removed: _paths.length, errors: [] }),
    nullPathsForAttempts: (_ids: string[]) => Promise.resolve(),
    now: () => Date.now(),
    log: (line: object) => {
      logs.push(line);
    },
  };
  return { ...base, ...overrides, __logs: logs };
}

function buildRequest(opts: { apikey?: string | null; method?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.apikey !== null) {
    headers['apikey'] = opts.apikey ?? 'service-role-key';
  }
  return new Request('http://localhost/audio-retention', {
    method: opts.method ?? 'POST',
    headers,
  });
}

Deno.test('OPTIONS preflight returns 204', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(
    new Request('http://localhost/audio-retention', { method: 'OPTIONS' }),
  );
  assertEquals(res.status, 204);
});

Deno.test('returns 401 without service-role apikey', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(buildRequest({ apikey: 'anon-key' }));
  assertEquals(res.status, 401);
});

Deno.test('returns 405 on non-POST', async () => {
  const handler = createHandler(happyDeps());
  const res = await handler(buildRequest({ method: 'GET' }));
  assertEquals(res.status, 405);
});

Deno.test('happy path — removes storage blobs + nulls attempt paths + logs', async () => {
  let removedPaths: string[] = [];
  let nulledIds: string[] = [];
  const deps = happyDeps({
    removeStorageObjects: (paths) => {
      removedPaths = paths;
      return Promise.resolve({ removed: paths.length, errors: [] });
    },
    nullPathsForAttempts: (ids) => {
      nulledIds = ids;
      return Promise.resolve();
    },
  });
  const handler = createHandler(deps);
  const res = await handler(buildRequest());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.removed_count, 2);
  assertEquals(body.data.error_count, 0);

  assertEquals(removedPaths.sort(), [
    `${FAKE_USER_A}/c1/x.webm`,
    `${FAKE_USER_B}/c2/y.webm`,
  ]);
  assertEquals(nulledIds.sort(), ['att-1', 'att-2']);

  const logs = (deps as unknown as { __logs: object[] }).__logs;
  const line = logs[0] as Record<string, unknown>;
  assertEquals(line.fn, 'audio-retention');
  assertEquals(line.removed_count, 2);
  assertEquals(line.error_count, 0);
});

Deno.test('no stale audio → returns 200 with removed_count: 0; no DB writes', async () => {
  let removeCalls = 0;
  let nullCalls = 0;
  const handler = createHandler(
    happyDeps({
      getStaleFreeAudio: () => Promise.resolve([]),
      removeStorageObjects: (_p) => {
        removeCalls += 1;
        return Promise.resolve({ removed: 0, errors: [] });
      },
      nullPathsForAttempts: (_ids) => {
        nullCalls += 1;
        return Promise.resolve();
      },
    }),
  );
  const res = await handler(buildRequest());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.removed_count, 0);
  assertEquals(removeCalls, 0);
  assertEquals(nullCalls, 0);
});

Deno.test('partial storage failure — successful paths still get nulled; errors logged', async () => {
  const failedPath = `${FAKE_USER_A}/c1/x.webm`;
  let nulledIds: string[] = [];
  const handler = createHandler(
    happyDeps({
      removeStorageObjects: (paths) =>
        Promise.resolve({
          removed: paths.length - 1,
          errors: [{ path: failedPath, message: 'Object not found' }],
        }),
      nullPathsForAttempts: (ids) => {
        nulledIds = ids;
        return Promise.resolve();
      },
    }),
  );
  const res = await handler(buildRequest());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.removed_count, 1);
  assertEquals(body.data.error_count, 1);
  // The failed-path's attempt is NOT nulled — it stays so a future run can retry.
  assertEquals(nulledIds, ['att-2']);
});

Deno.test('rows are batched in groups of ≤ 100 (storage API hard cap)', async () => {
  // Synthesize 250 stale attempts.
  const many: StaleAttempt[] = Array.from({ length: 250 }, (_, i) => ({
    id: `att-${i}`,
    user_id: FAKE_USER_A,
    audio_storage_path: `${FAKE_USER_A}/cN/x${i}.webm`,
  }));
  let batchSizes: number[] = [];
  const handler = createHandler(
    happyDeps({
      getStaleFreeAudio: () => Promise.resolve(many),
      removeStorageObjects: (paths) => {
        batchSizes.push(paths.length);
        return Promise.resolve({ removed: paths.length, errors: [] });
      },
    }),
  );
  const res = await handler(buildRequest());
  assertEquals(res.status, 200);
  // Each batch should be ≤ 100. 250 split as 100 + 100 + 50.
  assertEquals(batchSizes, [100, 100, 50]);
});
