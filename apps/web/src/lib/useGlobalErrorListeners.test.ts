import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const logMock = vi.fn();
vi.mock('./error-log', () => ({
  logClientError: (...args: unknown[]) => logMock(...args),
}));

import { useGlobalErrorListeners } from './useGlobalErrorListeners';

describe('useGlobalErrorListeners', () => {
  afterEach(() => {
    logMock.mockReset();
  });

  it('logs window error events', () => {
    const { unmount } = renderHook(() => useGlobalErrorListeners());
    const ev = new ErrorEvent('error', {
      message: 'window error',
      error: new Error('window error'),
      filename: 'foo.js',
      lineno: 42,
    });
    window.dispatchEvent(ev);
    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('window error') }),
    );
    unmount();
  });

  it('logs unhandled promise rejections', () => {
    const { unmount } = renderHook(() => useGlobalErrorListeners());
    // Constructing a real PromiseRejectionEvent in jsdom requires a Promise,
    // so synthesize one and dispatch.
    const promise = Promise.reject(new Error('unhandled rejection'));
    // Catch so the test runner doesn't itself surface the rejection.
    promise.catch(() => undefined);
    const ev = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(ev, 'reason', { value: new Error('unhandled rejection') });
    Object.defineProperty(ev, 'promise', { value: promise });
    window.dispatchEvent(ev);
    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('unhandled rejection') }),
    );
    unmount();
  });

  it('removes listeners on unmount', () => {
    const { unmount } = renderHook(() => useGlobalErrorListeners());
    unmount();
    window.dispatchEvent(new ErrorEvent('error', { message: 'after unmount' }));
    expect(logMock).not.toHaveBeenCalled();
  });
});
