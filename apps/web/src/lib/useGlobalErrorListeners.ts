import { useEffect } from 'react';
import { logClientError } from './error-log';

declare const __APP_VERSION__: string | undefined;

function baseContext(): Record<string, unknown> {
  return {
    route: typeof window !== 'undefined' ? window.location.pathname : null,
    app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    viewport_w: typeof window !== 'undefined' ? window.innerWidth : null,
    viewport_h: typeof window !== 'undefined' ? window.innerHeight : null,
  };
}

function reasonToMessage(reason: unknown): { message: string; stack: string | null } {
  if (reason instanceof Error) {
    return { message: reason.message, stack: reason.stack ?? null };
  }
  if (typeof reason === 'string') return { message: reason, stack: null };
  try {
    return { message: JSON.stringify(reason), stack: null };
  } catch {
    return { message: String(reason), stack: null };
  }
}

export function useGlobalErrorListeners(): void {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      const message = ev.message || (ev.error instanceof Error ? ev.error.message : 'window error');
      const stack = ev.error instanceof Error ? ev.error.stack ?? null : null;
      logClientError({ message, stack, ...baseContext() });
    };

    const onRejection = (ev: PromiseRejectionEvent) => {
      const { message, stack } = reasonToMessage(ev.reason);
      logClientError({ message: `unhandled rejection: ${message}`, stack, ...baseContext() });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
}
