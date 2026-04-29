import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import React from 'react';

const useAuthUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => useAuthUserMock(),
}));

import DeckListPage from './DeckListPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(
    QueryClientProvider,
    { client },
    React.createElement(MemoryRouter, null, children),
  );
}

function mockDecksResult(decks: Array<{
  id: string;
  name: string;
  language_code: string;
  cefr_level: string;
  source: string;
  cards: Array<{ count: number }>;
}>) {
  return {
    select: vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: decks, error: null }),
      }),
    }),
  };
}

describe('DeckListPage', () => {
  beforeEach(() => {
    useAuthUserMock.mockReset();
    fromMock.mockReset();
    useAuthUserMock.mockReturnValue({
      user: { id: 'u-1', email: 'a@example.com' },
      isLoading: false,
    });
  });

  it('renders a heading naming the page', () => {
    fromMock.mockImplementation(() => mockDecksResult([]));
    render(<DeckListPage />, { wrapper });
    expect(screen.getByRole('heading', { name: /decks/i })).toBeInTheDocument();
  });

  it('renders one DeckListItem per deck returned by the query', async () => {
    fromMock.mockImplementation(() =>
      mockDecksResult([
        {
          id: 'es-deck',
          name: 'Spanish — Starter (A1)',
          language_code: 'es',
          cefr_level: 'A1',
          source: 'bundled',
          cards: [{ count: 30 }],
        },
        {
          id: 'fr-deck',
          name: 'French — Starter (A1)',
          language_code: 'fr',
          cefr_level: 'A1',
          source: 'bundled',
          cards: [{ count: 30 }],
        },
      ]),
    );
    render(<DeckListPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getAllByTestId('deck-list-item')).toHaveLength(2);
    });
    expect(screen.getByText(/Spanish — Starter/)).toBeInTheDocument();
    expect(screen.getByText(/French — Starter/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no decks', async () => {
    fromMock.mockImplementation(() => mockDecksResult([]));
    render(<DeckListPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/no decks yet|nothing here/i)).toBeInTheDocument();
    });
  });

  it('renders an alert with Retry when the query fails', async () => {
    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'network down' } }),
        }),
      }),
    }));
    render(<DeckListPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/network down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
