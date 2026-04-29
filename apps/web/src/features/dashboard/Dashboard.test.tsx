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

  it('renders the placeholder review queue', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('Ben');
      if (table === 'user_languages') return mockUserLanguagesQuery(['es']);
      throw new Error(`unexpected table ${table}`);
    });

    render(<Dashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/Phase 2/i)).toBeInTheDocument();
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
});
