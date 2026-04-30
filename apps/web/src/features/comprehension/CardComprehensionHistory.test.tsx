import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => ({ user: { id: 'u-1', email: 'a@example.com' }, isLoading: false }),
}));

import { CardComprehensionHistory } from './CardComprehensionHistory';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

function mockAttempts(rows: Array<{ id: string; response_ms: number; correct: boolean; created_at: string }>) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  }));
}

describe('CardComprehensionHistory', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('shows empty state when there are no attempts', async () => {
    mockAttempts([]);
    render(<CardComprehensionHistory cardId="c1" />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/no attempts yet/i)).toBeInTheDocument();
    });
  });

  it('renders one row per attempt with correctness + response time + date', async () => {
    mockAttempts([
      { id: 'a1', response_ms: 1500, correct: true, created_at: '2026-04-30T10:00:00Z' },
      { id: 'a2', response_ms: 5800, correct: false, created_at: '2026-04-29T10:00:00Z' },
    ]);
    render(<CardComprehensionHistory cardId="c1" />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('card-comprehension-history')).toBeInTheDocument();
    });
    expect(screen.getByText('correct')).toBeInTheDocument();
    expect(screen.getByText('miss')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
    expect(screen.getByText('5.8s')).toBeInTheDocument();
  });

  it('renders an alert when the query errors', async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: 'rls denied' } }),
            }),
          }),
        }),
      }),
    }));
    render(<CardComprehensionHistory cardId="c1" />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
  });

  it('shows "Load more" when the result page is full', async () => {
    const fullPage = Array.from({ length: 20 }, (_, i) => ({
      id: `a${i}`,
      response_ms: 2000,
      correct: true,
      created_at: '2026-04-30T10:00:00Z',
    }));
    mockAttempts(fullPage);
    render(<CardComprehensionHistory cardId="c1" pageSize={20} />, { wrapper });
    const loadMore = await screen.findByRole('button', { name: /load more/i });
    expect(loadMore).toBeInTheDocument();
  });

  it('does NOT show "Load more" when the result is shorter than pageSize', async () => {
    mockAttempts([
      { id: 'a1', response_ms: 1500, correct: true, created_at: '2026-04-30T10:00:00Z' },
    ]);
    render(<CardComprehensionHistory cardId="c1" pageSize={20} />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('correct')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});
