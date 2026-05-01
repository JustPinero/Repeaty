/**
 * `audio-retention` — production wiring. Same shape as the other Edge
 * Functions but no per-request user JWT context — the caller is the
 * Supabase Cron runner using the service-role key.
 *
 * Schedule (configured outside this repo, in the Supabase Dashboard):
 *   POST https://<project-ref>.supabase.co/functions/v1/audio-retention
 *   Header: apikey: $SUPABASE_SERVICE_ROLE_KEY
 *   Cadence: daily 03:30 UTC (an hour after the existing
 *   `audio-retention-daily` pg_cron job that NULLs the paths).
 */

import { createClient } from '@supabase/supabase-js';
import { createHandler, type HandlerDeps, type StaleAttempt } from './handler.ts';
import { validateEnv } from '../_shared/validate-env.ts';

const env = validateEnv({
  SUPABASE_URL: { required: true },
  SUPABASE_SERVICE_ROLE_KEY: { required: true },
});

const serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const deps: HandlerDeps = {
  isAuthorizedServiceRole(apikey: string) {
    return apikey === env.SUPABASE_SERVICE_ROLE_KEY;
  },

  async getStaleFreeAudio() {
    // The 7-day-and-tier='free' filter is identical to migration 0013's
    // SQL function. We could call that function here for consistency, but
    // we want the row ids back too so we know which to NULL after a
    // successful blob delete. Re-implement inline.
    const { data, error } = await serviceClient
      .from('pronunciation_attempts')
      .select('id, user_id, audio_storage_path, profiles!inner(tier), created_at')
      .not('audio_storage_path', 'is', null)
      .eq('profiles.tier', 'free')
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1000);
    if (error || !data) return [];
    return (data as unknown as Array<{
      id: string;
      user_id: string;
      audio_storage_path: string;
    }>).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      audio_storage_path: r.audio_storage_path,
    } satisfies StaleAttempt));
  },

  async removeStorageObjects(paths: string[]) {
    const { data, error } = await serviceClient.storage
      .from('pronunciation-audio')
      .remove(paths);
    if (error) {
      // Whole-batch failure (e.g. network) — mark every path as failed.
      return {
        removed: 0,
        errors: paths.map((p) => ({ path: p, message: error.message })),
      };
    }
    // supabase-js `remove` returns FileObject[] for the removed entries; any
    // path not in the response was either missing or hit a per-row error.
    const removedSet = new Set((data ?? []).map((d) => (d as { name?: string }).name ?? ''));
    const errors: Array<{ path: string; message: string }> = [];
    for (const p of paths) {
      if (!removedSet.has(p)) {
        errors.push({ path: p, message: 'remove() did not echo the path back' });
      }
    }
    return { removed: removedSet.size, errors };
  },

  async nullPathsForAttempts(ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await serviceClient
      .from('pronunciation_attempts')
      .update({ audio_storage_path: null })
      .in('id', ids);
    if (error) throw new Error(error.message);
  },

  now: () => Date.now(),
  log(line) {
    console.log(JSON.stringify(line));
  },
};

Deno.serve(createHandler(deps));
