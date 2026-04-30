import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

// Replace OnboardingWizard with a sentinel so we can assert which branch rendered.
vi.mock('./OnboardingWizard', () => ({
  OnboardingWizard: () => <div data-testid="wizard">WIZARD</div>,
}));

import { OnboardingGuard } from './OnboardingGuard';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

function mockProfileQuery(profileResult: {
  data: { display_name: string | null; native_language_code: string | null } | null;
  error: { message: string } | null;
}) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(profileResult),
      }),
    }),
  };
}

function mockUserLanguagesQuery(userLangsResult: { data: unknown[]; error: { message: string } | null }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(userLangsResult),
    }),
  };
}

describe('OnboardingGuard', () => {
  beforeEach(() => {
    useAuthUserMock.mockReset();
    fromMock.mockReset();
    useAuthUserMock.mockReturnValue({ user: { id: 'user-1', email: 'a@example.com' }, isLoading: false });
  });

  it('renders the wizard when display_name is null', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles')
        return mockProfileQuery({ data: { display_name: null, native_language_code: null }, error: null });
      if (table === 'user_languages') return mockUserLanguagesQuery({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    render(
      <OnboardingGuard>
        <div data-testid="protected">PROTECTED</div>
      </OnboardingGuard>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('wizard')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('renders the wizard when user_languages is empty', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles')
        return mockProfileQuery({
          data: { display_name: 'Ben', native_language_code: 'en-US' },
          error: null,
        });
      if (table === 'user_languages') return mockUserLanguagesQuery({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    render(
      <OnboardingGuard>
        <div data-testid="protected">PROTECTED</div>
      </OnboardingGuard>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('wizard')).toBeInTheDocument();
    });
  });

  it('renders children when profile + user_languages are both populated', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles')
        return mockProfileQuery({
          data: { display_name: 'Ben', native_language_code: 'en-US' },
          error: null,
        });
      if (table === 'user_languages')
        return mockUserLanguagesQuery({
          data: [{ language_code: 'es', cefr_level: 'A1' }],
          error: null,
        });
      throw new Error(`unexpected table ${table}`);
    });

    render(
      <OnboardingGuard>
        <div data-testid="protected">PROTECTED</div>
      </OnboardingGuard>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('protected')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
  });

  it('renders an alert with a Retry button when the profile query fails', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles')
        return mockProfileQuery({
          data: null,
          error: { message: 'network down' },
        });
      if (table === 'user_languages') return mockUserLanguagesQuery({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    render(
      <OnboardingGuard>
        <div data-testid="protected">PROTECTED</div>
      </OnboardingGuard>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/network down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });
});
