import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { Rating } from '@repeaty/shared';

// supabase.from(...).select().eq() chain returns a thenable resolving to {data,error}.
// supabase.from(...).upsert() returns a thenable resolving to {error}.
const cardsResult = vi.fn();
const reviewsResult = vi.fn();
const upsertResult = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'cards') {
        return {
          select: () => ({
            eq: () => ({ order: () => cardsResult() }),
          }),
        };
      }
      if (table === 'reviews') {
        return {
          select: () => ({
            eq: (_col: string, _val: unknown) => ({
              in: () => reviewsResult(),
            }),
          }),
          upsert: (...args: unknown[]) => upsertResult(...args),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => ({ user: { id: 'u-1', email: 'a@example.com' }, isLoading: false }),
}));

import { useReviewSession } from './useReviewSession';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

const cards = [
  { id: 'c1', target_text: 'hola', native_text: 'hello', ipa: null, example_sentence_target: null, example_sentence_native: null },
  { id: 'c2', target_text: 'gracias', native_text: 'thank you', ipa: null, example_sentence_target: null, example_sentence_native: null },
  { id: 'c3', target_text: 'adiós', native_text: 'goodbye', ipa: null, example_sentence_target: null, example_sentence_native: null },
];

describe('useReviewSession', () => {
  beforeEach(() => {
    cardsResult.mockReset();
    reviewsResult.mockReset();
    upsertResult.mockReset();
    upsertResult.mockResolvedValue({ error: null });
  });

  it('starts in loading state and lands on the first card after fetch', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    reviewsResult.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.currentCard).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.currentCard?.id).toBe('c1');
    expect(result.current.progress.total).toBe(3);
    expect(result.current.progress.remaining).toBe(3);
    expect(result.current.progress.reviewed).toBe(0);
  });

  it('advances to the next card after Good rating', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    reviewsResult.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.submitRating(Rating.Good);
    });
    expect(result.current.currentCard?.id).toBe('c2');
    expect(result.current.progress.reviewed).toBe(1);
    expect(result.current.progress.correct).toBe(1);
  });

  it('re-enqueues the current card on Again (visits it again before completing)', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    reviewsResult.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // c1 → Again → goes to back of queue (remaining: c2, c3, c1).
    await act(async () => { await result.current.submitRating(Rating.Again); });
    expect(result.current.currentCard?.id).toBe('c2');
    expect(result.current.progress.correct).toBe(0);

    await act(async () => { await result.current.submitRating(Rating.Good); });
    expect(result.current.currentCard?.id).toBe('c3');

    await act(async () => { await result.current.submitRating(Rating.Good); });
    expect(result.current.currentCard?.id).toBe('c1');

    // c1 again, this time Good → done.
    await act(async () => { await result.current.submitRating(Rating.Good); });
    expect(result.current.isComplete).toBe(true);
    expect(result.current.progress.reviewed).toBe(4); // c1×2 + c2 + c3
    expect(result.current.progress.correct).toBe(3);  // 3 Goods, 1 Again
  });

  it('upserts a reviews row with FSRS-derived state on each rating', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    reviewsResult.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.submitRating(Rating.Good); });

    expect(upsertResult).toHaveBeenCalledTimes(1);
    const [payload] = upsertResult.mock.calls[0]!;
    expect(payload).toMatchObject({
      user_id: 'u-1',
      card_id: 'c1',
    });
    expect(payload.fsrs_state).toBeTypeOf('object');
    expect(payload.fsrs_state.v).toBe(1);
    expect(typeof payload.due_at).toBe('string');
    expect(typeof payload.interval_days).toBe('number');
  });

  it('renders an error state when the cards query fails', async () => {
    cardsResult.mockResolvedValue({ data: null, error: { message: 'network down' } });
    reviewsResult.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/network down/);
  });
});
