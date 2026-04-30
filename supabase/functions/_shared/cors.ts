/**
 * CORS headers + preflight handler for browser-originating Edge Function calls.
 * `Access-Control-Allow-Origin: *` is fine in v1 — JWT auth gates everything
 * and we don't read cookies. Tighten before opening the API to third parties
 * (see `references/security-landmines.md`).
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}
