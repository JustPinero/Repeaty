/**
 * `flip-tier` Edge Function — wraps the `flip_tier(target, new_tier, reason)`
 * SQL RPC (migration 0016). Auth check is layered: the Edge Function verifies
 * the JWT and parses the body, then the SECURITY DEFINER RPC enforces the
 * admin / target-not-self / valid-tier rules. Any RPC raise is mapped back
 * to an api-contracts.md error code.
 */

import { z } from 'zod';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonSuccess } from '../_shared/error.ts';

const RequestSchema = z.object({
  target_user_id: z.string().uuid(),
  new_tier: z.enum(['free', 'pro', 'admin']),
  reason: z.string().max(500).optional(),
});

type RequestBody = z.infer<typeof RequestSchema>;

export type RpcResult = {
  logId: string | null;
  /** Maps to the SQL RAISE message — one of NOT_ADMIN, SELF_FLIP_FORBIDDEN,
   * TARGET_NOT_FOUND, NO_CHANGE, INVALID_TIER, UNAUTHENTICATED, or null on
   * success. */
  error: string | null;
};

export type HandlerDeps = {
  getUserFromJwt(jwt: string): Promise<{ id: string } | null>;
  callFlipTier(
    actorJwt: string,
    targetUserId: string,
    newTier: string,
    reason: string | null,
  ): Promise<RpcResult>;
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
        actorId: null,
        result: jsonError('INVALID_PAYLOAD', 'Only POST is supported'),
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      return finalize({
        deps,
        requestId,
        startedAt,
        actorId: null,
        result: jsonError('UNAUTHENTICATED', 'Missing JWT'),
      });
    }
    const user = await deps.getUserFromJwt(jwt);
    if (!user) {
      return finalize({
        deps,
        requestId,
        startedAt,
        actorId: null,
        result: jsonError('UNAUTHENTICATED', 'Invalid JWT'),
      });
    }

    let parsed: RequestBody;
    try {
      const raw = (await req.json()) as unknown;
      const out = RequestSchema.safeParse(raw);
      if (!out.success) {
        const issues = out.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        return finalize({
          deps,
          requestId,
          startedAt,
          actorId: user.id,
          result: jsonError('INVALID_PAYLOAD', issues),
        });
      }
      parsed = out.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'invalid JSON';
      return finalize({
        deps,
        requestId,
        startedAt,
        actorId: user.id,
        result: jsonError('INVALID_PAYLOAD', msg),
      });
    }

    const rpc = await deps.callFlipTier(
      jwt,
      parsed.target_user_id,
      parsed.new_tier,
      parsed.reason ?? null,
    );

    if (rpc.error) {
      const result = mapRpcError(rpc.error);
      return finalize({
        deps,
        requestId,
        startedAt,
        actorId: user.id,
        result,
      });
    }
    if (!rpc.logId) {
      return finalize({
        deps,
        requestId,
        startedAt,
        actorId: user.id,
        result: jsonError('INTERNAL', 'flip_tier returned no log id'),
      });
    }

    return finalize({
      deps,
      requestId,
      startedAt,
      actorId: user.id,
      result: jsonSuccess({ log_id: rpc.logId }),
    });
  };
}

function mapRpcError(rpcError: string): Response {
  const tag = rpcError.split(':')[0]?.trim().toUpperCase();
  switch (tag) {
    case 'NOT_ADMIN':
      return jsonError('FORBIDDEN_TIER', 'Caller is not an admin');
    case 'SELF_FLIP_FORBIDDEN':
      return jsonError(
        'FORBIDDEN_RESOURCE',
        'Cannot flip your own tier',
      );
    case 'TARGET_NOT_FOUND':
      return jsonError('NOT_FOUND', 'Target user not found');
    case 'NO_CHANGE':
    case 'INVALID_TIER':
      return jsonError('INVALID_PAYLOAD', rpcError);
    case 'UNAUTHENTICATED':
      return jsonError('UNAUTHENTICATED', 'Caller not authenticated');
    default:
      return jsonError('INTERNAL', `flip_tier failed: ${rpcError}`);
  }
}

function finalize(args: {
  deps: HandlerDeps;
  requestId: string;
  startedAt: number;
  actorId: string | null;
  result: Response;
}): Response {
  const latency_ms = args.deps.now() - args.startedAt;
  args.deps.log({
    fn: 'flip-tier',
    request_id: args.requestId,
    actor_id: args.actorId,
    status: args.result.status,
    latency_ms,
  });
  return args.result;
}
