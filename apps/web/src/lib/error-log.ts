import { supabase } from './supabase';

export type ClientErrorPayload = {
  message: string;
  stack?: string | null;
  route?: string | null;
  app_version?: string | null;
  user_agent?: string | null;
  viewport_w?: number | null;
  viewport_h?: number | null;
  extra?: Record<string, unknown> | null;
};

const STACK_BYTES = 8 * 1024;
const EXTRA_BYTES = 4 * 1024;
const SECRET_FIELD = /(password|token|jwt|api[_-]?key|secret)/i;
const API_KEY_PATTERN = /sk-(?:ant-)?[A-Za-z0-9_-]{8,}/g;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

let timestamps: number[] = [];

export function __resetErrorLogRateLimit(): void {
  timestamps = [];
}

function clipString(s: string, maxBytes: number): string {
  if (typeof TextEncoder === 'undefined') return s.slice(0, maxBytes);
  const enc = new TextEncoder();
  const bytes = enc.encode(s);
  if (bytes.length <= maxBytes) return s;
  return new TextDecoder().decode(bytes.slice(0, maxBytes));
}

function scrubString(value: string): string {
  return value.replace(API_KEY_PATTERN, '<scrubbed>');
}

function scrubExtra(extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (SECRET_FIELD.test(k)) continue;
    if (typeof v === 'string') {
      out[k] = scrubString(v);
    } else {
      out[k] = v;
    }
  }
  // Cap serialized size.
  const serialized = JSON.stringify(out);
  if (serialized.length > EXTRA_BYTES) {
    return { _truncated: true, _bytes: serialized.length };
  }
  return out;
}

export function scrubPayload(p: ClientErrorPayload): ClientErrorPayload {
  return {
    ...p,
    message: scrubString(p.message),
    stack: p.stack ? clipString(scrubString(p.stack), STACK_BYTES) : p.stack ?? null,
    extra: p.extra ? scrubExtra(p.extra) : p.extra ?? null,
  };
}

function checkRateLimit(now: number): boolean {
  timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  return true;
}

export function logClientError(payload: ClientErrorPayload): void {
  try {
    const now = Date.now();
    if (!checkRateLimit(now)) return;

    const scrubbed = scrubPayload(payload);
    void Promise.resolve(supabase.from('client_error_log').insert(scrubbed)).catch(
      () => undefined,
    );
  } catch {
    // Never propagate — error logging must not itself crash the app.
  }
}
