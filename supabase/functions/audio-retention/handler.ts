/**
 * `audio-retention` Edge Function — service-role-only audio file-blob
 * cleanup. Companion to migration 0013's `purge_free_tier_audio()` SQL
 * function: that one NULLs `pronunciation_attempts.audio_storage_path` for
 * stale free-tier rows; this function actually removes the underlying
 * Storage blobs (which Supabase blocks from direct DELETE FROM
 * storage.objects).
 *
 * Invocation: Supabase Cron daily (configured in the Supabase Dashboard,
 * not in `pg_cron`, since it's an Edge Function not a SQL function).
 * The Cron runner sends `apikey: <SUPABASE_SERVICE_ROLE_KEY>`. Browsers
 * cannot reach this function — there's no JWT-bearer path.
 *
 * Activates DEBT-005.
 */

import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonSuccess } from '../_shared/error.ts';

const STORAGE_REMOVE_BATCH = 100;

export type StaleAttempt = {
  id: string;
  user_id: string;
  audio_storage_path: string;
};

export type RemoveResult = {
  removed: number;
  errors: Array<{ path: string; message: string }>;
};

export type HandlerDeps = {
  /** True iff the request's apikey header matches the service-role key. */
  isAuthorizedServiceRole(apikey: string): boolean;
  /** Returns the rows that need their blobs removed. The SQL filter is
   * tier='free' AND created_at < now() - 7 days AND audio_storage_path IS
   * NOT NULL. Caps at 1000 per run (subsequent runs pick up the rest). */
  getStaleFreeAudio(): Promise<StaleAttempt[]>;
  /** Calls supabase.storage.from('pronunciation-audio').remove(paths). */
  removeStorageObjects(paths: string[]): Promise<RemoveResult>;
  /** UPDATE pronunciation_attempts SET audio_storage_path = NULL WHERE
   * id IN (...). Only called for the rows whose blobs were actually
   * removed (so a partial-failure run can retry the remainder). */
  nullPathsForAttempts(ids: string[]): Promise<void>;
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
        removedCount: 0,
        errorCount: 0,
        result: jsonError('INVALID_PAYLOAD', 'Only POST is supported'),
      }, 405);
    }

    const apikey = req.headers.get('apikey') ?? '';
    if (!deps.isAuthorizedServiceRole(apikey)) {
      return finalize({
        deps,
        requestId,
        startedAt,
        removedCount: 0,
        errorCount: 0,
        result: jsonError('UNAUTHENTICATED', 'service-role key required'),
      });
    }

    const stale = await deps.getStaleFreeAudio();
    if (stale.length === 0) {
      return finalize({
        deps,
        requestId,
        startedAt,
        removedCount: 0,
        errorCount: 0,
        result: jsonSuccess({ removed_count: 0, error_count: 0 }),
      });
    }

    // Group attempts so we can null the attempt-ids for any row whose
    // storage delete succeeded, while leaving the failed-path attempts in
    // place for the next run.
    const byPath = new Map<string, StaleAttempt>();
    for (const a of stale) byPath.set(a.audio_storage_path, a);

    let totalRemoved = 0;
    const failedPaths = new Set<string>();
    const successfulIds: string[] = [];

    // Batch in chunks of 100 — the Supabase Storage `remove` API caps at
    // that count per call.
    const allPaths = stale.map((s) => s.audio_storage_path);
    for (let i = 0; i < allPaths.length; i += STORAGE_REMOVE_BATCH) {
      const batch = allPaths.slice(i, i + STORAGE_REMOVE_BATCH);
      const result = await deps.removeStorageObjects(batch);
      totalRemoved += result.removed;
      for (const err of result.errors) failedPaths.add(err.path);
    }

    // Collect ids for paths we successfully removed.
    for (const a of stale) {
      if (!failedPaths.has(a.audio_storage_path)) successfulIds.push(a.id);
    }

    if (successfulIds.length > 0) {
      await deps.nullPathsForAttempts(successfulIds);
    }

    return finalize({
      deps,
      requestId,
      startedAt,
      removedCount: totalRemoved,
      errorCount: failedPaths.size,
      result: jsonSuccess({
        removed_count: totalRemoved,
        error_count: failedPaths.size,
      }),
    });
  };
}

function finalize(args: {
  deps: HandlerDeps;
  requestId: string;
  startedAt: number;
  removedCount: number;
  errorCount: number;
  result: Response;
}, statusOverride?: number): Response {
  const latency_ms = args.deps.now() - args.startedAt;
  args.deps.log({
    fn: 'audio-retention',
    request_id: args.requestId,
    status: statusOverride ?? args.result.status,
    latency_ms,
    removed_count: args.removedCount,
    error_count: args.errorCount,
  });
  if (statusOverride && statusOverride !== args.result.status) {
    return new Response(args.result.body, {
      status: statusOverride,
      headers: args.result.headers,
    });
  }
  return args.result;
}
