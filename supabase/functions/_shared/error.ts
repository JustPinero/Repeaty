import {
  EDGE_ERROR_HTTP_STATUS,
  type EdgeErrorCode,
} from './edge-errors.ts';
import { corsHeaders } from './cors.ts';

const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' };

export function jsonError(
  code: EdgeErrorCode,
  message: string,
  meta?: { latency_ms: number },
): Response {
  return new Response(
    JSON.stringify({ data: null, error: { code, message }, meta }),
    { status: EDGE_ERROR_HTTP_STATUS[code], headers: JSON_HEADERS },
  );
}

export function jsonSuccess<T>(
  data: T,
  meta?: { latency_ms: number; cost_usd?: number },
): Response {
  return new Response(JSON.stringify({ data, error: null, meta }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
