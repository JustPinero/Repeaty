import React from 'react';
import { logClientError } from '@/lib/error-log';

declare const __APP_VERSION__: string | undefined;

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logClientError({
      message: error.message || 'render error',
      stack: error.stack ?? info.componentStack ?? null,
      route: typeof window !== 'undefined' ? window.location.pathname : null,
      app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      viewport_w: typeof window !== 'undefined' ? window.innerWidth : null,
      viewport_h: typeof window !== 'undefined' ? window.innerHeight : null,
    });
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="mx-auto max-w-md p-6 text-center">
          <h1 className="mb-3 text-xl font-semibold">Something went wrong</h1>
          <p className="mb-4 text-sm text-gray-600">
            The error has been logged. Reload to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
