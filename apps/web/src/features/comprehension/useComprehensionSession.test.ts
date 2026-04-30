import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

// Query chains:
//   from('decks').select().eq().is().maybeSingle()  → existence check
//   from('cards').select(...).eq('deck_id').order('id') → cards
//   from('comprehension_attempts').insert(...)        → write on submit (3.4)
const deckResult = vi.fn();
const cardsResult = vi.fn();
const attemptsInsert = vi.fn();

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
            eq: () => ({ order: () => cardsResult() }),
          }),
        };
      }
      if (table === 'comprehension_attempts') {
        return {
          insert: (...args: unknown[]) => attemptsInsert(...args),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => ({ user: { id: 'u-1', email: 'a@example.com' }, isLoading: false }),
}));

import { useComprehensionSession } from './useComprehensionSession';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

const cards = [
  { id: 'c1', target_text: 'hola', native_text: 'hello', language_code: 'es' },
  { id: 'c2', target_text: 'gracias', native_text: 'thank you', language_code: 'es' },
  { id: 'c3', target_text: 'adiós', native_text: 'goodbye', language_code: 'es' },
];

describe('useComprehensionSession', () => {
  beforeEach(() => {
    deckResult.mockReset();
    cardsResult.mockReset();
    attemptsInsert.mockReset();
    deckResult.mockResolvedValue({ data: { id: 'deck-1' }, error: null });
    attemptsInsert.mockResolvedValue({ error: null });
  });

  it('lands on the first card after the deck + cards fetch', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentCard?.id).toBe('c1');
    expect(result.current.progress.total).toBe(3);
    expect(result.current.progress.remaining).toBe(3);
  });

  it('submitResponse computes a CardResult with bucket + score and exposes it via pendingResult', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let submitted;
    await act(async () => {
      submitted = await result.current.submitResponse('hello');
    });
    expect(submitted).toMatchObject({
      cardId: 'c1',
      bucket: 'perfect',
      response: 'hello',
    });
    expect(submitted!.score).toBeGreaterThanOrEqual(90);
    expect(result.current.pendingResult?.cardId).toBe('c1');
    // We don't advance until next() is called.
    expect(result.current.currentCard?.id).toBe('c1');
  });

  it('next() advances to the next card and clears pendingResult', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.submitResponse('hello'); });
    act(() => result.current.next());
    expect(result.current.currentCard?.id).toBe('c2');
    expect(result.current.pendingResult).toBeNull();
    expect(result.current.progress.reviewed).toBe(1);
  });

  it('a wholly-wrong response gets bucket "miss"', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let submitted;
    await act(async () => { submitted = await result.current.submitResponse('xxx'); });
    expect(submitted!.bucket).toBe('miss');
  });

  it('after the last card, isComplete becomes true and exposes averageScore', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (let i = 0; i < 3; i++) {
      await act(async () => { await result.current.submitResponse(['hello', 'thank you', 'goodbye'][i]!); });
      act(() => result.current.next());
    }
    expect(result.current.isComplete).toBe(true);
    expect(result.current.progress.averageScore).toBeGreaterThan(0);
  });

  it('throws DECK_NOT_FOUND when the deck SELECT returns null', async () => {
    deckResult.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useComprehensionSession('bad-id'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('DECK_NOT_FOUND');
    expect(cardsResult).not.toHaveBeenCalled();
  });

  it('renders an error state when the cards query fails', async () => {
    cardsResult.mockResolvedValue({ data: null, error: { message: 'network down' } });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/network down/);
  });

  it('inserts a comprehension_attempts row on submit with response_ms + correct flag', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.submitResponse('hello'); });

    expect(attemptsInsert).toHaveBeenCalledTimes(1);
    const [payload] = attemptsInsert.mock.calls[0]!;
    expect(payload).toMatchObject({
      user_id: 'u-1',
      card_id: 'c1',
      correct: true,
    });
    expect(payload.response_ms).toBeTypeOf('number');
    expect(payload.response_ms).toBeGreaterThanOrEqual(0);
  });

  it('records correct=false for a missed answer', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.submitResponse('xxx'); });

    const [payload] = attemptsInsert.mock.calls[0]!;
    expect(payload.correct).toBe(false);
  });

  it('continues to UX-resolve even if the attempts insert fails (logs to console.error)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    attemptsInsert.mockResolvedValue({ error: { message: 'rls blocked' } });
    cardsResult.mockResolvedValue({ data: cards, error: null });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let submitted;
    await act(async () => { submitted = await result.current.submitResponse('hello'); });
    expect(submitted!.bucket).toBe('perfect');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores re-entrant submitResponse calls while a submission is in flight', async () => {
    cardsResult.mockResolvedValue({ data: cards, error: null });
    let resolveInsert: (v: { error: null }) => void = () => {};
    attemptsInsert.mockImplementationOnce(
      () => new Promise<{ error: null }>((r) => { resolveInsert = r; }),
    );
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let firstPromise: Promise<unknown> | undefined;
    let secondCallThrew = false;
    await act(async () => {
      firstPromise = result.current.submitResponse('hello');
      try {
        await result.current.submitResponse('world');
      } catch {
        secondCallThrew = true;
      }
      await Promise.resolve();
    });

    // Only one insert kicked off — re-entrancy guard short-circuited the second.
    expect(attemptsInsert).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInsert({ error: null });
      await firstPromise;
    });

    void secondCallThrew;
    expect(result.current.pendingResult).not.toBeNull();
  });

  it('marks isComplete with empty-state semantics when the deck has zero cards', async () => {
    cardsResult.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useComprehensionSession('deck-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.progress.total).toBe(0);
    expect(result.current.currentCard).toBeNull();
  });
});
