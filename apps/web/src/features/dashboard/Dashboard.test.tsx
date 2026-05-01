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
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => useAuthUserMock(),
  useProfile: () => ({
    profile: {
      id: 'u-1',
      display_name: 'Ben',
      email: 'ben@example.com',
      native_language_code: 'en-US',
      tier: 'free',
      is_admin: false,
    },
    isLoading: false,
  }),
}));

// Stub the ReviewQueue (it has its own tests). This keeps the Dashboard
// fromMock surface narrow — only profiles/user_languages flows need to be
// mocked here.
vi.mock('./ReviewQueue', () => ({
  ReviewQueue: () => <section data-testid="review-queue-stub">queue</section>,
}));

import Dashboard from './Dashboard';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(
    QueryClientProvider,
    { client },
    React.createElement(MemoryRouter, null, children),
  );
}

function mockProfileQuery(displayName: string | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { display_name: displayName },
          error: null,
        }),
      }),
    }),
  };
}

function mockUserLanguagesQuery(codes: string[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: codes.map((c) => ({ language_code: c })),
        error: null,
      }),
    }),
  };
}

describe('Dashboard', () => {
  beforeEach(() => {
    useAuthUserMock.mockReset();
    fromMock.mockReset();
    useAuthUserMock.mockReturnValue({
      user: { id: 'u-1', email: 'a@example.com' },
      isLoading: false,
    });
  });

  it('greets the user by display_name once profile loads', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('Ben');
      if (table === 'user_languages') return mockUserLanguagesQuery(['es']);
      throw new Error(`unexpected table ${table}`);
    });

    render(<Dashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Hi.*Ben/i })).toBeInTheDocument();
    });
  });

  it('renders the review queue', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('Ben');
      if (table === 'user_languages') return mockUserLanguagesQuery(['es']);
      throw new Error(`unexpected table ${table}`);
    });

    render(<Dashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('review-queue-stub')).toBeInTheDocument();
    });
  });

  it('shows the language selector only when the user has > 1 target language', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('Ben');
      if (table === 'user_languages') return mockUserLanguagesQuery(['es', 'fr']);
      throw new Error(`unexpected table ${table}`);
    });

    render(<Dashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByLabelText(/active language|studying/i)).toBeInTheDocument();
    });
  });

  it('does NOT show the language selector when only one target language', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('Ben');
      if (table === 'user_languages') return mockUserLanguagesQuery(['es']);
      throw new Error(`unexpected table ${table}`);
    });

    render(<Dashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Hi.*Ben/i })).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/active language|studying/i)).not.toBeInTheDocument();
  });

  it('shows an alert with a Retry button when the dashboard query fails', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles')
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'network down' },
              }),
            }),
          }),
        };
      if (table === 'user_languages') return mockUserLanguagesQuery([]);
      throw new Error(`unexpected table ${table}`);
    });

    render(<Dashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/network down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    // Header still rendered so user can sign out.
    expect(screen.getByRole('button', { name: /sign out|log ?out/i })).toBeInTheDocument();
    // Greeting/queue NOT rendered.
    expect(screen.queryByRole('heading', { name: /Hi.*Ben/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-queue-stub')).not.toBeInTheDocument();
  });
});
