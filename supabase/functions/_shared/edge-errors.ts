/**
 * Deno-side mirror of `packages/shared/src/edge-errors.ts`. The Node copy is the
 * source of truth — drift-audit verifies the two stay in lockstep. Duplicated
 * because Deno can't traverse the pnpm symlink graph cleanly.
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
