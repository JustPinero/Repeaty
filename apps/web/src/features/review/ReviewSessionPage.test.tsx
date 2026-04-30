import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import React from 'react';

const useReviewSessionMock = vi.fn();

vi.mock('./useReviewSession', () => ({
  useReviewSession: (deckId: string) => useReviewSessionMock(deckId),
}));

// The page imports Flashcard via @/features/decks (barrel), which transitively
// loads @/lib/supabase → loadEnv. Stub the supabase module so the env-validator
// doesn't fire in jsdom.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

import ReviewSessionPage from './ReviewSessionPage';

function renderAt(path: string) {
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(MemoryRouter, { initialEntries: [path] }, children);
  }
  return render(
    <Routes>
      <Route path="/app/decks/:deckId/review" element={<ReviewSessionPage />} />
    </Routes>,
    { wrapper: Wrapper },
  );
}

const baseProgress = { reviewed: 0, remaining: 1, total: 1, correct: 0 };

describe('ReviewSessionPage', () => {
  beforeEach(() => {
    useReviewSessionMock.mockReset();
  });

  it('shows loading state while the session loads', () => {
    useReviewSessionMock.mockReturnValue({
      isLoading: true,
      isError: false,
      error: null,
      isComplete: false,
      currentCard: null,
      progress: { reviewed: 0, remaining: 0, total: 0, correct: 0 },
      submitRating: vi.fn(),
    });
    renderAt('/app/decks/deck-1/review');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders the current card and rating buttons during a session', () => {
    useReviewSessionMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      isComplete: false,
      currentCard: {
        id: 'c1',
        target_text: 'hola',
        native_text: 'hello',
        ipa: null,
        example_sentence_target: null,
        example_sentence_native: null,
        language_code: 'es',
      },
      progress: baseProgress,
      submitRating: vi.fn(),
    });
    renderAt('/app/decks/deck-1/review');
    expect(screen.getByText('hola')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^good$/i })).toBeInTheDocument();
  });

  it('shows an empty state when there are no due cards', () => {
    useReviewSessionMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      isComplete: true,
      currentCard: null,
      progress: { reviewed: 0, remaining: 0, total: 0, correct: 0 },
      submitRating: vi.fn(),
    });
    renderAt('/app/decks/deck-1/review');
    expect(screen.getByText(/nothing due|no cards/i)).toBeInTheDocument();
  });

  it('shows a completion summary after the queue is drained', () => {
    useReviewSessionMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      isComplete: true,
      currentCard: null,
      progress: { reviewed: 5, remaining: 0, total: 5, correct: 4 },
      submitRating: vi.fn(),
    });
    renderAt('/app/decks/deck-1/review');
    expect(screen.getByRole('heading', { name: /session complete|done/i })).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/80%|4 \/ 5/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard|home/i })).toBeInTheDocument();
  });

  it('calls submitRating when the user clicks Good (after revealing)', async () => {
    const submitRating = vi.fn().mockResolvedValue(undefined);
    useReviewSessionMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      isComplete: false,
      currentCard: {
        id: 'c1',
        target_text: 'hola',
        native_text: 'hello',
        ipa: null,
        example_sentence_target: null,
        example_sentence_native: null,
        language_code: 'es',
      },
      progress: baseProgress,
      submitRating,
    });
    const user = userEvent.setup();
    renderAt('/app/decks/deck-1/review');

    // Reveal first.
    await user.click(screen.getByRole('button', { name: /reveal|show answer/i }));
    await user.click(screen.getByRole('button', { name: /^good$/i }));

    await waitFor(() => {
      expect(submitRating).toHaveBeenCalledTimes(1);
    });
    expect(submitRating).toHaveBeenCalledWith(3);
  });

  it('shows an error alert with Retry when the session fails to load', () => {
    useReviewSessionMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error('network down'),
      isComplete: false,
      currentCard: null,
      progress: { reviewed: 0, remaining: 0, total: 0, correct: 0 },
      submitRating: vi.fn(),
    });
    renderAt('/app/decks/deck-1/review');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/network down/)).toBeInTheDocument();
  });
});
