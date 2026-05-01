/**
 * `flip-tier` — production wiring. The handler factory's deps are bound to
 * a service-role admin client (for the RPC call — SECURITY DEFINER inside
 * `flip_tier` does the actual auth-uid check) and an anon client for JWT
 * verification.
 */

import { createClient } from '@supabase/supabase-js';
import { createHandler, type HandlerDeps, type RpcResult } from './handler.ts';
import { validateEnv } from '../_shared/validate-env.ts';

const env = validateEnv({
  SUPABASE_URL: { required: true },
  SUPABASE_ANON_KEY: { required: true },
  SUPABASE_SERVICE_ROLE_KEY: { required: true },
});

const serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function userClient(jwt: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const deps: HandlerDeps = {
  async getUserFromJwt(jwt: string) {
    const { data, error } = await serviceClient.auth.getUser(jwt);
    if (error || !data.user) return null;
    return { id: data.user.id };
  },

  async callFlipTier(
    actorJwt: string,
    targetUserId: string,
    newTier: string,
    reason: string | null,
  ): Promise<RpcResult> {
    // Call the RPC under the *user* JWT so `auth.uid()` resolves to the actor
    // inside the SECURITY DEFINER function. The function's body bypasses RLS
    // for the UPDATE/INSERT, but the auth.uid() lookup is what locks the
    // admin check + self-flip guard.
    const client = userClient(actorJwt);
    const { data, error } = await client.rpc('flip_tier', {
      p_target_id: targetUserId,
      p_new_tier: newTier,
      p_reason: reason,
    });
    if (error) {
      return { logId: null, error: error.message ?? 'unknown' };
    }
    return { logId: (data as string) ?? null, error: null };
  },

  now: () => Date.now(),

  log(line) {
    console.log(JSON.stringify(line));
  },
};

Deno.serve(createHandler(deps));
