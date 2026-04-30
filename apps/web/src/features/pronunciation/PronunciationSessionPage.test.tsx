import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const sessionMock = vi.fn();
const submitRecordingMock = vi.fn();
const nextMock = vi.fn();

vi.mock('./usePronunciationSession', () => ({
  usePronunciationSession: (...args: unknown[]) => sessionMock(...args),
  isDeckNotFoundError: (e: unknown) =>
    e instanceof Error && e.message === 'DECK_NOT_FOUND',
  DECK_NOT_FOUND: 'DECK_NOT_FOUND',
}));

const canRecordMock = vi.fn(() => true);
const requestMicPermissionMock = vi.fn(async () => 'prompt' as const);
const startRecordingMock = vi.fn(async () => ({ __brand: 'RecordingHandle' as const }));
const stopRecordingMock = vi.fn(
  async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
);
vi.mock('@/platform', () => ({
  platform: {
    canRecord: () => canRecordMock(),
    requestMicPermission: () => requestMicPermissionMock(),
    startRecording: () => startRecordingMock(),
    stopRecording: (h: unknown) => stopRecordingMock(h),
    cancelRecording: () => undefined,
    playRecordedAudio: async () => undefined,
  },
}));

vi.mock('@/features/feedback', () => ({
  FeedbackPanel: () => React.createElement('div', { 'data-testid': 'feedback-panel' }),
}));

import { PronunciationSessionPage } from './PronunciationSessionPage';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        MemoryRouter,
        { initialEntries: [path] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: '/app/decks/:deckId/pronunciation',
            element: React.createElement(PronunciationSessionPage),
          }),
        ),
      ),
    ),
  );
}

const baseSession = {
  isLoading: false,
  isError: false,
  error: null,
  isComplete: false,
  currentCard: { id: 'card-1', target_text: 'hola', language_code: 'es' },
  pendingResult: null,
  progress: { reviewed: 0, remaining: 1, total: 1, averageScore: 0 },
  submitRecording: submitRecordingMock,
  next: nextMock,
};

describe('PronunciationSessionPage', () => {
  beforeEach(() => {
    sessionMock.mockReset();
    submitRecordingMock.mockReset();
    nextMock.mockReset();
    canRecordMock.mockReturnValue(true);
    requestMicPermissionMock.mockResolvedValue('prompt' as const);
    startRecordingMock.mockResolvedValue({ __brand: 'RecordingHandle' as const });
    stopRecordingMock.mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
    );
  });

  it('renders the target word + Record button', () => {
    sessionMock.mockReturnValue(baseSession);
    renderAt('/app/decks/deck-1/pronunciation');
    expect(screen.getByText('hola')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument();
  });

  it('shows loading then content', () => {
    sessionMock.mockReturnValue({ ...baseSession, isLoading: true, currentCard: null });
    renderAt('/app/decks/deck-1/pronunciation');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders deck-not-found UX', () => {
    sessionMock.mockReturnValue({
      ...baseSession,
      isError: true,
      error: new Error('DECK_NOT_FOUND'),
      currentCard: null,
    });
    renderAt('/app/decks/deck-1/pronunciation');
    expect(screen.getByRole('heading', { name: /deck not found/i })).toBeInTheDocument();
  });

  it('renders empty-deck UX', () => {
    sessionMock.mockReturnValue({
      ...baseSession,
      isComplete: true,
      currentCard: null,
      progress: { reviewed: 0, remaining: 0, total: 0, averageScore: 0 },
    });
    renderAt('/app/decks/deck-1/pronunciation');
    expect(screen.getByRole('heading', { name: /this deck is empty/i })).toBeInTheDocument();
  });

  it('completion summary shows average score', () => {
    sessionMock.mockReturnValue({
      ...baseSession,
      isComplete: true,
      currentCard: null,
      progress: { reviewed: 3, remaining: 0, total: 3, averageScore: 84 },
    });
    renderAt('/app/decks/deck-1/pronunciation');
    expect(screen.getByRole('heading', { name: /session complete/i })).toBeInTheDocument();
    expect(screen.getByText(/84/)).toBeInTheDocument();
  });

  it('after recording, calls submitRecording and renders the score panel', async () => {
    submitRecordingMock.mockResolvedValue({
      attemptId: 'att-1',
      similarityScore: 0.9,
      score: 90,
      bucket: 'perfect',
      transcript: 'Hola',
    });
    sessionMock.mockReturnValue(baseSession);

    const user = userEvent.setup();
    renderAt('/app/decks/deck-1/pronunciation');

    await user.click(screen.getByRole('button', { name: /start recording/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /stop recording/i }));

    await waitFor(() => {
      expect(submitRecordingMock).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the result panel when pendingResult is present', () => {
    sessionMock.mockReturnValue({
      ...baseSession,
      pendingResult: {
        attemptId: 'att-1',
        similarityScore: 0.9,
        score: 90,
        bucket: 'perfect',
        transcript: 'Hola',
      },
    });
    renderAt('/app/decks/deck-1/pronunciation');
    expect(screen.getByText(/90/)).toBeInTheDocument();
    expect(screen.getByText(/Hola/)).toBeInTheDocument();
    expect(screen.getByTestId('feedback-panel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view card history/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument();
  });

  it('Next button calls session.next()', async () => {
    sessionMock.mockReturnValue({
      ...baseSession,
      pendingResult: {
        attemptId: 'att-1',
        similarityScore: 0.9,
        score: 90,
        bucket: 'perfect',
        transcript: 'Hola',
      },
    });
    const user = userEvent.setup();
    renderAt('/app/decks/deck-1/pronunciation');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(nextMock).toHaveBeenCalledTimes(1);
  });
});
