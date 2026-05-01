import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import React from 'react';

const useComprehensionSessionMock = vi.fn();

vi.mock('./useComprehensionSession', () => ({
  useComprehensionSession: (deckId: string) => useComprehensionSessionMock(deckId),
  isDeckNotFoundError: (error: unknown) =>
    error instanceof Error && error.message === 'DECK_NOT_FOUND',
}));

vi.mock('@/features/feedback', () => ({
  FeedbackPanel: () => React.createElement('div', { 'data-testid': 'feedback-panel' }),
}));

import ComprehensionSessionPage from './ComprehensionSessionPage';

function renderAt(path: string) {
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(MemoryRouter, { initialEntries: [path] }, children);
  }
  return render(
    <Routes>
      <Route path="/app/decks/:deckId/comprehension" element={<ComprehensionSessionPage />} />
    </Routes>,
    { wrapper: Wrapper },
  );
}

const baseProgress = {
  reviewed: 0,
  remaining: 1,
  total: 1,
  averageScore: 0,
  averageResponseMs: 0,
};

describe('ComprehensionSessionPage', () => {
  beforeEach(() => {
    useComprehensionSessionMock.mockReset();
  });

  it('shows loading state while the session loads', () => {
    useComprehensionSessionMock.mockReturnValue({
      isLoading: true,
      isError: false,
      error: null,
      isComplete: false,
      currentCard: null,
      pendingResult: null,
      progress: { reviewed: 0, remaining: 0, total: 0, averageScore: 0, averageResponseMs: 0 },
      submitResponse: vi.fn(),
      next: vi.fn(),
    });
    renderAt('/app/decks/deck-1/comprehension');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders the prompt + input + Submit while answering a card', () => {
    useComprehensionSessionMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      isComplete: false,
      currentCard: { id: 'c1', target_text: 'hola', native_text: 'hello', language_code: 'es' },
      pendingResult: null,
      progress: baseProgress,
      submitResponse: vi.fn(),
      next: vi.fn(),
    });
    renderAt('/app/decks/deck-1/comprehension');
    expect(screen.getByText('hola')).toBeInTheDocument();
    expect(screen.getByLabelText(/your translation|type your answer/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    // Soft timer is visible.
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('calls submitResponse with the trimmed input on submit', async () => {
    const submitResponse = vi.fn().mockResolvedValue({
      cardId: 'c1', score: 100, bucket: 'perfect', responseMs: 1000, similarity: 1, response: 'hello',
    });
    useComprehensionSessionMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      isComplete: false,
      currentCard: { id: 'c1', target_text: 'hola', native_text: 'hello', language_code: 'es' },
      pendingResult: null,
      progress: baseProgress,
      submitResponse,
      next: vi.fn(),
    });
    const user = userEvent.setup();
    renderAt('/app/decks/deck-1/comprehension');

    await user.type(screen.getByLabelText(/your translation|type your answer/i), '  hello  ');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(submitResponse).toHaveBeenCalledTimes(1);
    });
    expect(submitResponse).toHaveBeenCalledWith('hello');
  });

  it('renders the per-card result + Next when pendingResult is set', async () => {
    useComprehensionSessionMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      isComplete: false,
      currentCard: { id: 'c1', target_text: 'hola', native_text: 'hello', language_code: 'es' },
      pendingResult: {
        cardId: 'c1', score: 100, bucket: 'perfect', responseMs: 1500, similarity: 1, response: 'hello',
      },
      progress: { reviewed: 0, remaining: 1, total: 1, averageScore: 0, averageResponseMs: 0 },
      submitResponse: vi.fn(),
      next: vi.fn(),
    });
    renderAt('/app/decks/deck-1/comprehension');
    expect(screen.getByText(/perfect|100/i)).toBeInTheDocument();
    // The user's response is rendered inside a <strong>, accessible by
    // text from the strong element directly.
    const yourAnswer = screen.getAllByText('hello');
    expect(yourAnswer.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('shows the completion summary with average score + average response time', () => {
    useComprehensionSessionMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      isComplete: true,
      currentCard: null,
      pendingResult: null,
      progress: { reviewed: 5, remaining: 0, total: 5, averageScore: 84, averageResponseMs: 3200 },
      submitResponse: vi.fn(),
      next: vi.fn(),
    });
    renderAt('/app/decks/deck-1/comprehension');
    expect(screen.getByRole('heading', { name: /session complete|done/i })).toBeInTheDocument();
    expect(screen.getByText(/84/)).toBeInTheDocument();
    expect(screen.getByText(/3\.2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard|home/i })).toBeInTheDocument();
  });

  it('renders a "Deck not found" alert when error.message === "DECK_NOT_FOUND"', () => {
    useComprehensionSessionMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error('DECK_NOT_FOUND'),
      isComplete: false,
      currentCard: null,
      pendingResult: null,
      progress: baseProgress,
      submitResponse: vi.fn(),
      next: vi.fn(),
    });
    renderAt('/app/decks/bad-id/comprehension');
    expect(screen.getByRole('heading', { name: /deck not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to your decks/i })).toBeInTheDocument();
  });
});
