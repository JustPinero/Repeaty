import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

// Stub the history panel — has its own tests; this file just smoke-tests
// the page composition + route wiring.
vi.mock('@/features/comprehension/CardComprehensionHistory', () => ({
  CardComprehensionHistory: () => <div data-testid="history-stub">history</div>,
}));

import CardDetailPage from './CardDetail';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(MemoryRouter, { initialEntries: [path] }, children),
    );
  }
  return render(
    <Routes>
      <Route path="/app/decks/:deckId/cards/:cardId" element={<CardDetailPage />} />
    </Routes>,
    { wrapper: Wrapper },
  );
}

const card = {
  id: 'c1',
  target_text: 'hola',
  native_text: 'hello',
  ipa: 'ˈo.la',
  example_sentence_target: '¡Hola, ¿cómo estás?',
  example_sentence_native: 'Hi, how are you?',
  language_code: 'es',
};

function mockCardQuery(result: { data: typeof card | null; error: { message: string } | null }) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'cards') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve(result) }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe('CardDetailPage', () => {
  beforeEach(() => {
    fromMock.mockReset();
    useAuthUserMock.mockReset();
    useAuthUserMock.mockReturnValue({
      user: { id: 'u-1', email: 'a@example.com' },
      isLoading: false,
    });
  });

  it('renders the card target + native text + IPA + examples', async () => {
    mockCardQuery({ data: card, error: null });
    renderAt('/app/decks/d-1/cards/c1');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'hola' })).toBeInTheDocument();
    });
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('/ˈo.la/')).toBeInTheDocument();
    expect(screen.getByText('¡Hola, ¿cómo estás?')).toBeInTheDocument();
    expect(screen.getByText('Hi, how are you?')).toBeInTheDocument();
  });

  it('mounts the comprehension-history panel', async () => {
    mockCardQuery({ data: card, error: null });
    renderAt('/app/decks/d-1/cards/c1');
    await waitFor(() => {
      expect(screen.getByTestId('history-stub')).toBeInTheDocument();
    });
  });

  it('shows a "Card not found" message when the query returns null', async () => {
    mockCardQuery({ data: null, error: null });
    renderAt('/app/decks/d-1/cards/missing');
    await waitFor(() => {
      expect(screen.getByText(/card not found/i)).toBeInTheDocument();
    });
  });

  it('shows an alert when the query fails', async () => {
    mockCardQuery({ data: null, error: { message: 'rls denied' } });
    renderAt('/app/decks/d-1/cards/c1');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
  });

  it('renders a "Back to deck" link', async () => {
    mockCardQuery({ data: card, error: null });
    renderAt('/app/decks/d-1/cards/c1');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /back to deck/i })).toBeInTheDocument();
    });
  });
});
