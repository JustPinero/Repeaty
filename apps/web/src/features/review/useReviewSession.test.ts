import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { Rating } from '@repeaty/shared';

// Query chains:
//   from('decks').select().eq().is().maybeSingle()  → existence check
//   from('cards').select(...).eq('deck_id').eq('reviews.user_id').order('id')
//                                                  → cards + nested reviews
//   from('reviews').upsert(...)                     → write on rate
const deckResult = vi.fn();
const cardsResult = vi.fn();
const upsertResult = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'decks') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({ maybeSingle: () => deckResult() }),
            }),
          }),
        };
      }
      if (table === 'cards') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ order: () => cardsResult() }),
            }),
          }),
        };
      }
      if (table === 'reviews') {
        return {
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

const enqueueReviewMock = vi.fn(async (_payload: unknown) => {});
vi.mock('@/lib/offline-queue', () => ({
  enqueueReview: (payload: unknown) => enqueueReviewMock(payload),
}));

import { useReviewSession } from './useReviewSession';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

// Each row carries a `reviews` array (zero or one element after the user_id
// filter). Empty array = "new card" path; one element = "resume from prior
// FSRS state" path.
const cards = [
  { id: 'c1', target_text: 'hola', native_text: 'hello', ipa: null, example_sentence_target: null, example_sentence_native: null, language_code: 'es', reviews: [] as Array<{ fsrs_state: unknown }> },
  { id: 'c2', target_text: 'gracias', native_text: 'thank you', ipa: null, example_sentence_target: null, example_sentence_native: null, language_code: 'es', reviews: [] as Array<{ fsrs_state: unknown }> },
  { id: 'c3', target_text: 'adiós', native_text: 'goodbye', ipa: null, example_sentence_target: null, example_sentence_native: null, language_code: 'es', reviews: [] as Array<{ fsrs_state: unknown }> },
];

describe('useReviewSession', () => {
  beforeEach(() => {
    deckResult.mockReset();
    cardsResult.mockReset();
    upsertResult.mockReset();
    enqueueReviewMock.mockReset();
    deckResult.mockResolvedValue({ data: { id: 'deck-1' }, error: null });
    upsertResult.mockResolvedValue({ error: null });
  });

  it('starts in loading state and lands on the first card after fetch', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });

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
    const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.submitRating(Rating.Again); });
    expect(result.current.currentCard?.id).toBe('c2');
    expect(result.current.progress.correct).toBe(0);

    await act(async () => { await result.current.submitRating(Rating.Good); });
    expect(result.current.currentCard?.id).toBe('c3');

    await act(async () => { await result.current.submitRating(Rating.Good); });
    expect(result.current.currentCard?.id).toBe('c1');

    await act(async () => { await result.current.submitRating(Rating.Good); });
    expect(result.current.isComplete).toBe(true);
    expect(result.current.progress.reviewed).toBe(4);
    expect(result.current.progress.correct).toBe(3);
  });

  it('upserts a reviews row with FSRS-derived state on each rating', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
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

  it('uses the per-card persisted FSRS state when reviews come back populated', async () => {
    const persistedState = {
      v: 1,
      due: '2026-04-30T18:00:00.000Z',
      stability: 7.5,
      difficulty: 4,
      elapsed_days: 0,
      scheduled_days: 7,
      reps: 3,
      lapses: 0,
      state: 2,
      last_review: '2026-04-23T18:00:00.000Z',
    };
    const cardsWithReview = [
      { ...cards[0], reviews: [{ fsrs_state: persistedState }] },
      cards[1],
      cards[2],
    ];
    cardsResult.mockResolvedValue({ data: cardsWithReview, error: null });

    const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // After Good on c1, the new state is derived from persistedState (reps=3),
    // not from a fresh initialState. The FSRS scheduler will produce a new
    // scheduled_days > 7 (mature card).
    await act(async () => { await result.current.submitRating(Rating.Good); });
    const [payload] = upsertResult.mock.calls[0]!;
    expect(payload.fsrs_state.reps).toBe(4);
  });

  it('renders an error state when the cards query fails', async () => {
    cardsResult.mockResolvedValue({ data: null, error: { message: 'network down' } });
    const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/network down/);
  });

  it('throws DECK_NOT_FOUND when the deck SELECT returns null', async () => {
    deckResult.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useReviewSession('bad-deck-id'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('DECK_NOT_FOUND');
    // cards query should never have been issued.
    expect(cardsResult).not.toHaveBeenCalled();
  });

  it('isDeckNotFoundError detects the sentinel', async () => {
    const { isDeckNotFoundError } = await import('./useReviewSession');
    expect(isDeckNotFoundError(new Error('DECK_NOT_FOUND'))).toBe(true);
    expect(isDeckNotFoundError(new Error('something else'))).toBe(false);
    expect(isDeckNotFoundError(null)).toBe(false);
  });

  it('ignores re-entrant submitRating calls while the first is in flight', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    let resolveUpsert: (v: { error: null }) => void = () => {};
    upsertResult.mockImplementationOnce(
      () => new Promise<{ error: null }>((r) => { resolveUpsert = r; }),
    );
    const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let firstPromise: Promise<void> | undefined;
    let secondPromise: Promise<void> | undefined;
    await act(async () => {
      firstPromise = result.current.submitRating(Rating.Good);
      // Second call before first resolves — should be ignored by the ref guard.
      secondPromise = result.current.submitRating(Rating.Good);
      await Promise.resolve();
    });

    // Only one upsert kicked off.
    expect(upsertResult).toHaveBeenCalledTimes(1);

    // Resolve the first; both promises should settle.
    await act(async () => {
      resolveUpsert({ error: null });
      await firstPromise;
      await secondPromise;
    });

    // Exactly one rating counted.
    expect(result.current.progress.reviewed).toBe(1);
  });

  it('offline: enqueues to the Dexie queue instead of upserting', async () => {
    const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      cardsResult.mockResolvedValue({ data: cards, error: null });
      const { result } = renderHook(() => useReviewSession('deck-1'), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => { await result.current.submitRating(Rating.Good); });

      expect(enqueueReviewMock).toHaveBeenCalledTimes(1);
      const payload = (enqueueReviewMock.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
      expect(payload.user_id).toBe('u-1');
      expect(payload.card_id).toBe('c1');
      expect(typeof payload.due_at).toBe('string');
      expect(typeof payload.ease).toBe('number');

      // Online write path NOT exercised.
      expect(upsertResult).not.toHaveBeenCalled();
      // Local UI advances regardless: queue head moved off c1.
      expect(result.current.currentCard?.id).toBe('c2');
      expect(result.current.progress.reviewed).toBe(1);
    } finally {
      if (originalOnLine) Object.defineProperty(window.navigator, 'onLine', originalOnLine);
    }
  });
});
