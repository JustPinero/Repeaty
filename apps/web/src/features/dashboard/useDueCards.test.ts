import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const fromMock = vi.fn();
const useAuthUserMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
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

// Helper to mock the chain `from('reviews').select(...).eq(user_id).lte(due_at)` etc.
type DbResult<T> = { data: T; error: { message: string } | null };

function makeChain(returnValue: DbResult<unknown[]>) {
  const final = vi.fn().mockResolvedValue(returnValue);
  // The from() return needs to support .select().eq().lte() and .select().eq() patterns.
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({ then: undefined, ...final }),
      }),
    }),
    _final: final,
  };
}

describe('useDueCards', () => {
  beforeEach(() => {
    fromMock.mockReset();
    useAuthUserMock.mockReset();
    useAuthUserMock.mockReturnValue({
      user: { id: 'u-1', email: 'a@example.com' },
      isLoading: false,
    });
  });

  it('returns 0 due / 0 new when the user has no decks or reviews', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'reviews') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'cards') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'decks') {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { result } = renderHook(() => useDueCards(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalDue).toBe(0);
    expect(result.current.totalNew).toBe(0);
    expect(result.current.topDeck).toBeNull();
  });

  it('counts due reviews + new (unreviewed) cards across visible decks', async () => {
    const visibleDecks = [
      { id: 'd-es', name: 'Spanish — Starter (A1)', language_code: 'es' },
      { id: 'd-fr', name: 'French — Starter (A1)', language_code: 'fr' },
    ];
    const cards = [
      { id: 'c-es-1', deck_id: 'd-es' },
      { id: 'c-es-2', deck_id: 'd-es' },
      { id: 'c-es-3', deck_id: 'd-es' },
      { id: 'c-fr-1', deck_id: 'd-fr' },
      { id: 'c-fr-2', deck_id: 'd-fr' },
    ];
    // Two reviews exist: c-es-1 due now, c-es-2 due in future. 3 cards have no review (new).
    const dueReviews = [{ card_id: 'c-es-1' }];
    fromMock.mockImplementation((table: string) => {
      if (table === 'decks') {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: visibleDecks, error: null }),
          }),
        };
      }
      if (table === 'cards') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: cards, error: null }),
          }),
        };
      }
      if (table === 'reviews') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: dueReviews, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { result } = renderHook(() => useDueCards(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalDue).toBe(1);
    // 5 cards total - 1 reviewed = 4 new (no review row).
    expect(result.current.totalNew).toBe(4);
    expect(result.current.topDeck).not.toBeNull();
    // Spanish deck has more due+new (1 due + 2 new = 3) than French (0 due + 2 new = 2).
    expect(result.current.topDeck?.deckId).toBe('d-es');
  });

  it('surfaces an error when the decks query fails', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'decks') {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
          }),
        };
      }
      // Fallbacks (won't be reached).
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    const { result } = renderHook(() => useDueCards(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/boom/);
  });
});

void makeChain; // helper retained for readability; unused for now
