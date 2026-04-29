import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const getUserMock = vi.fn();
const onAuthStateChangeMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) =>
        onAuthStateChangeMock(cb),
    },
  },
}));

import { useAuthUser } from './useAuthUser';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useAuthUser', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    onAuthStateChangeMock.mockReset();
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('returns null user when supabase reports no session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { result } = renderHook(() => useAuthUser(), { wrapper });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.user).toBeNull();
  });

  it('returns the current user when supabase reports a session', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@example.com' } },
      error: null,
    });
    const { result } = renderHook(() => useAuthUser(), { wrapper });
    await waitFor(() => {
      expect(result.current.user?.id).toBe('u-1');
    });
  });

  it('subscribes to onAuthStateChange and updates when a SIGNED_IN event fires', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    let cb: ((evt: string, session: unknown) => void) | undefined;
    onAuthStateChangeMock.mockImplementation((c) => {
      cb = c;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const { result } = renderHook(() => useAuthUser(), { wrapper });
    await waitFor(() => {
      expect(result.current.user).toBeNull();
    });

    expect(cb).toBeDefined();

    act(() => {
      cb!('SIGNED_IN', { user: { id: 'u-2', email: 'b@example.com' } });
    });

    await waitFor(() => {
      expect(result.current.user?.id).toBe('u-2');
    });
  });
});
