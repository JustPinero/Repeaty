import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const rpcMock = vi.fn();
const useAuthUserMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => useAuthUserMock(),
}));

import { useDueCards } from './useDueCards';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useDueCards', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    useAuthUserMock.mockReset();
    useAuthUserMock.mockReturnValue({
      user: { id: 'u-1', email: 'a@example.com' },
      isLoading: false,
    });
  });

  it('returns 0 due / 0 new / null topDeck when the RPC returns []', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useDueCards(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(rpcMock).toHaveBeenCalledWith('due_cards_summary');
    expect(result.current.totalDue).toBe(0);
    expect(result.current.totalNew).toBe(0);
    expect(result.current.topDeck).toBeNull();
  });

  it('aggregates totals + picks the first row as topDeck (server-side sort)', async () => {
    rpcMock.mockResolvedValue({
      data: [
        // Server orders by (due+new) desc, deck_name asc; first row is top.
        { deck_id: 'd-es', deck_name: 'Spanish — Starter (A1)', language_code: 'es', due_count: 1, new_count: 2 },
        { deck_id: 'd-fr', deck_name: 'French — Starter (A1)', language_code: 'fr', due_count: 0, new_count: 2 },
      ],
      error: null,
    });
    const { result } = renderHook(() => useDueCards(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalDue).toBe(1);
    expect(result.current.totalNew).toBe(4);
    expect(result.current.topDeck).toEqual({
      deckId: 'd-es',
      deckName: 'Spanish — Starter (A1)',
      languageCode: 'es',
      dueCount: 1,
      newCount: 2,
    });
  });

  it('surfaces an error when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useDueCards(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/boom/);
  });
});
