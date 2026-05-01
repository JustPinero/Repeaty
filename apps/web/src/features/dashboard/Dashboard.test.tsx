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

const profileMock = vi.fn();
vi.mock('@/features/auth', () => ({
  useAuthUser: () => useAuthUserMock(),
  useProfile: () => profileMock(),
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

// Dashboard now sources display_name + tier + is_admin from `useProfile`
// (single source of truth). Only `user_languages` still hits supabase.from().
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

function mockUserLanguagesError(message: string) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: { message } }),
    }),
  };
}

const FREE_PROFILE = {
  id: 'u-1',
  display_name: 'Ben',
  email: 'ben@example.com',
  native_language_code: 'en-US',
  tier: 'free' as const,
  is_admin: false,
};
const PRO_PROFILE = { ...FREE_PROFILE, tier: 'pro' as const };

describe('Dashboard', () => {
  beforeEach(() => {
    useAuthUserMock.mockReset();
    fromMock.mockReset();
    profileMock.mockReset();
    useAuthUserMock.mockReturnValue({
      user: { id: 'u-1', email: 'a@example.com' },
      isLoading: false,
    });
    profileMock.mockReturnValue({ profile: FREE_PROFILE, isLoading: false });
  });

  it('greets the user by display_name once profile loads', async () => {
    fromMock.mockImplementation((table: string) => {
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
      if (table === 'user_languages') return mockUserLanguagesQuery(['es']);
      throw new Error(`unexpected table ${table}`);
    });

    render(<Dashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Hi.*Ben/i })).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/active language|studying/i)).not.toBeInTheDocument();
  });

  it('Pro tier: renders the "Generate a lesson" CTA linking to /app/generate', async () => {
    profileMock.mockReturnValue({ profile: PRO_PROFILE, isLoading: false });
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_languages') return mockUserLanguagesQuery(['es']);
      throw new Error(`unexpected table ${table}`);
    });
    render(<Dashboard />, { wrapper });
    const link = await screen.findByRole('link', { name: /generate a lesson/i });
    expect(link).toHaveAttribute('href', '/app/generate');
  });

  it('Free tier: does NOT render the Pro CTA', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_languages') return mockUserLanguagesQuery(['es']);
      throw new Error(`unexpected table ${table}`);
    });
    render(<Dashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('review-queue-stub')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /generate a lesson/i })).toBeNull();
  });

  it('shows an alert with a Retry button when the user_languages query fails', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_languages') return mockUserLanguagesError('network down');
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
