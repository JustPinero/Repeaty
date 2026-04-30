/**
 * Shared error codes for every Edge Function. The Deno-side function code keeps
 * its own copy at `supabase/functions/_shared/edge-errors.ts` (Deno can't
 * traverse the pnpm symlink graph) — drift-audit watches the two for
 * divergence.
 *
 * The HTTP status returned by the function is derived from the code via
 * `EDGE_ERROR_HTTP_STATUS`. Per `references/api-contracts.md`.
 */

export const EDGE_ERROR_CODES = [
  'INVALID_PAYLOAD',
  'UNAUTHENTICATED',
  'FORBIDDEN_TIER',
  'NOT_FOUND',
  'RATE_LIMITED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_FAILED',
  'INTERNAL',
] as const;

export type EdgeErrorCode = (typeof EDGE_ERROR_CODES)[number];

export const EDGE_ERROR_HTTP_STATUS: Record<EdgeErrorCode, number> = {
  INVALID_PAYLOAD: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_TIER: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_FAILED: 502,
  INTERNAL: 500,
};

export type EdgeErrorBody = {
  data: null;
  error: { code: EdgeErrorCode; message: string };
  meta?: { latency_ms: number };
};

export type EdgeSuccessBody<T> = {
  data: T;
  error: null;
  meta?: { latency_ms: number; cost_usd?: number };
};

export type EdgeResponseBody<T> = EdgeSuccessBody<T> | EdgeErrorBody;
