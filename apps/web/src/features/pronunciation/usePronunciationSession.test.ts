import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const fromMock = vi.fn();
const invokeMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => ({ user: { id: 'user-aaa' }, loading: false }),
}));

const uploadMock = vi.fn();
vi.mock('@/features/pronunciation/storage', () => ({
  uploadPronunciationBlob: (...args: unknown[]) => uploadMock(...args),
  MAX_AUDIO_BYTES: 10 * 1024 * 1024,
}));

import { usePronunciationSession, DECK_NOT_FOUND } from './usePronunciationSession';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

const FAKE_BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

function setupSupabase({
  deck = { id: 'deck-1' },
  cards = [
    { id: 'card-1', target_text: 'hola', language_code: 'es' },
    { id: 'card-2', target_text: 'adiós', language_code: 'es' },
  ],
}: {
  deck?: { id: string } | null;
  cards?: Array<{ id: string; target_text: string; language_code: string }>;
} = {}) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'decks') {
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () => Promise.resolve({ data: deck, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'cards') {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: cards, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

describe('usePronunciationSession', () => {
  beforeEach(() => {
    fromMock.mockReset();
    invokeMock.mockReset();
    uploadMock.mockReset();
    uploadMock.mockResolvedValue('user-aaa/card-1/abc.webm');
    invokeMock.mockResolvedValue({
      data: {
        data: {
          attempt_id: 'att-1',
          whisper_transcript: 'Hola',
          similarity_score: 0.95,
          expected: 'hola',
        },
        error: null,
      },
      error: null,
    });
  });

  it('loads cards for the deck and exposes the first one', async () => {
    setupSupabase();
    const { result } = renderHook(() => usePronunciationSession('deck-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.currentCard?.id).toBe('card-1');
    expect(result.current.progress.total).toBe(2);
  });

  it('throws DECK_NOT_FOUND when the deck row is missing', async () => {
    setupSupabase({ deck: null });
    const { result } = renderHook(() => usePronunciationSession('missing'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe(DECK_NOT_FOUND);
  });

  it('submitRecording uploads + invokes score-pronunciation + returns a result', async () => {
    setupSupabase();
    const { result } = renderHook(() => usePronunciationSession('deck-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let submitted!: Awaited<ReturnType<typeof result.current.submitRecording>>;
    await act(async () => {
      submitted = await result.current.submitRecording(FAKE_BLOB);
    });

    expect(uploadMock).toHaveBeenCalledWith(
      FAKE_BLOB,
      expect.objectContaining({ userId: 'user-aaa', cardId: 'card-1' }),
    );
    expect(invokeMock).toHaveBeenCalledWith('score-pronunciation', {
      body: { card_id: 'card-1', audio_storage_path: 'user-aaa/card-1/abc.webm' },
    });
    expect(submitted.attemptId).toBe('att-1');
    expect(submitted.similarityScore).toBe(0.95);
    expect(submitted.score).toBe(95);
    expect(submitted.bucket).toBe('perfect');
    expect(submitted.transcript).toBe('Hola');
    expect(result.current.pendingResult?.attemptId).toBe('att-1');
  });

  it('next() advances the queue and clears pendingResult', async () => {
    setupSupabase();
    const { result } = renderHook(() => usePronunciationSession('deck-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.submitRecording(FAKE_BLOB);
    });
    expect(result.current.pendingResult).not.toBeNull();

    act(() => {
      result.current.next();
    });

    expect(result.current.pendingResult).toBeNull();
    expect(result.current.currentCard?.id).toBe('card-2');
    expect(result.current.progress.reviewed).toBe(1);
  });

  it('bubbles upload failure as an error from submitRecording', async () => {
    uploadMock.mockRejectedValueOnce(new Error('upload broke'));
    setupSupabase();
    const { result } = renderHook(() => usePronunciationSession('deck-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.submitRecording(FAKE_BLOB);
      }),
    ).rejects.toThrow(/upload broke/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('bubbles Edge Function failure', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'edge-down', code: 'UPSTREAM_FAILED' },
    });
    setupSupabase();
    const { result } = renderHook(() => usePronunciationSession('deck-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.submitRecording(FAKE_BLOB);
      }),
    ).rejects.toThrow(/edge-down/);
  });

  it('marks isComplete=true after submitting + advancing past the last card', async () => {
    setupSupabase({
      cards: [{ id: 'card-only', target_text: 'gracias', language_code: 'es' }],
    });
    const { result } = renderHook(() => usePronunciationSession('deck-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.submitRecording(FAKE_BLOB);
    });
    act(() => {
      result.current.next();
    });

    expect(result.current.isComplete).toBe(true);
    expect(result.current.progress.averageScore).toBe(95);
  });

  it('isComplete=true and total=0 when the deck has no cards', async () => {
    setupSupabase({ cards: [] });
    const { result } = renderHook(() => usePronunciationSession('deck-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.progress.total).toBe(0);
  });
});
