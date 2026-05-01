import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const fromMock = vi.fn();
const createSignedUrlMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    storage: {
      from: () => ({
        createSignedUrl: (path: string, ttl: number) => createSignedUrlMock(path, ttl),
      }),
    },
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => ({ user: { id: 'user-aaa' }, loading: false }),
}));

import { CardPronunciationHistory } from './CardPronunciationHistory';

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    React.createElement(QueryClientProvider, { client }, ui),
  );
}

function setSelect(rows: Array<Record<string, unknown>>, error: { message: string } | null = null) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: rows, error }),
          }),
        }),
      }),
    }),
  }));
}

describe('CardPronunciationHistory', () => {
  beforeEach(() => {
    fromMock.mockReset();
    createSignedUrlMock.mockReset();
  });

  it('renders the empty-state message when there are no attempts', async () => {
    setSelect([]);
    renderWithClient(<CardPronunciationHistory cardId="card-1" />);
    await waitFor(() => {
      expect(screen.getByText(/No attempts yet/i)).toBeInTheDocument();
    });
  });

  it('renders one row per attempt with the score percentage', async () => {
    setSelect([
      {
        id: 'a1',
        similarity_score: 0.92,
        whisper_transcript: 'hola',
        audio_storage_path: 'user-aaa/card-1/abc.webm',
        created_at: '2026-04-29T12:00:00Z',
      },
      {
        id: 'a2',
        similarity_score: 0.55,
        whisper_transcript: 'ola',
        audio_storage_path: null,
        created_at: '2026-04-28T12:00:00Z',
      },
    ]);
    renderWithClient(<CardPronunciationHistory cardId="card-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('card-pronunciation-history')).toBeInTheDocument();
    });
    expect(screen.getByText('92/100')).toBeInTheDocument();
    expect(screen.getByText('55/100')).toBeInTheDocument();
  });

  it('only renders a Play button when audio_storage_path is non-null', async () => {
    setSelect([
      {
        id: 'a1',
        similarity_score: 0.9,
        whisper_transcript: 'hola',
        audio_storage_path: 'user-aaa/card-1/abc.webm',
        created_at: '2026-04-29T12:00:00Z',
      },
      {
        id: 'a2',
        similarity_score: 0.5,
        whisper_transcript: 'reaped',
        audio_storage_path: null,
        created_at: '2026-04-22T12:00:00Z',
      },
    ]);
    renderWithClient(<CardPronunciationHistory cardId="card-1" />);
    const playButtons = await screen.findAllByRole('button', { name: /play attempt/i });
    expect(playButtons).toHaveLength(1);
  });

  it('clicking Play creates a signed URL', async () => {
    setSelect([
      {
        id: 'a1',
        similarity_score: 0.9,
        whisper_transcript: 'hola',
        audio_storage_path: 'user-aaa/card-1/abc.webm',
        created_at: '2026-04-29T12:00:00Z',
      },
    ]);
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/abc' },
      error: null,
    });
    const user = userEvent.setup();
    renderWithClient(<CardPronunciationHistory cardId="card-1" />);
    const btn = await screen.findByRole('button', { name: /play attempt/i });
    await user.click(btn);
    await waitFor(() => {
      expect(createSignedUrlMock).toHaveBeenCalledWith('user-aaa/card-1/abc.webm', 60);
    });
  });

  it('renders an error message on query failure', async () => {
    setSelect([], { message: 'rls denied' });
    renderWithClient(<CardPronunciationHistory cardId="card-1" />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/rls denied/i);
    });
  });
});
