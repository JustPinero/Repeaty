import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import React from 'react';

const signOutMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => ({ user: { id: 'u-1' }, isLoading: false }),
  useProfile: () => ({
    profile: {
      id: 'u-1',
      display_name: 'Ben',
      email: 'a@example.com',
      native_language_code: 'en-US',
      tier: 'free',
      is_admin: false,
    },
    isLoading: false,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { Header } from './Header';

function renderHeader(props: { displayName: string | null } = { displayName: 'Ben' }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Pre-populate the auth + dashboard caches so we can verify the sign-out
  // path actually clears them.
  client.setQueryData(['auth-user'], { id: 'u-1', email: 'a@example.com' });
  client.setQueryData(['onboarding-status', 'u-1'], { needsOnboarding: false });
  client.setQueryData(['dashboard', 'u-1'], { displayName: 'Ben', targetLanguageCodes: ['es'] });

  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(MemoryRouter, null, children),
    );
  }

  const utils = render(<Header {...props} />, { wrapper: Wrapper });
  return { ...utils, client };
}

describe('Header', () => {
  beforeEach(() => {
    signOutMock.mockReset();
    navigateMock.mockReset();
    signOutMock.mockResolvedValue({ error: null });
  });

  it('renders the user display name', () => {
    renderHeader({ displayName: 'Ben' });
    expect(screen.getByText(/Ben/)).toBeInTheDocument();
  });

  it('exposes a Sign out button that is keyboard-reachable', () => {
    renderHeader();
    const button = screen.getByRole('button', { name: /sign out|log ?out/i });
    expect(button).toBeInTheDocument();
    expect(button.tabIndex).not.toBe(-1);
  });

  it('calls supabase.auth.signOut and navigates to /login on click', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: /sign out|log ?out/i }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('clears auth-related query cache before navigating', async () => {
    const user = userEvent.setup();
    const { client } = renderHeader();
    expect(client.getQueryData(['auth-user'])).not.toBeUndefined();

    await user.click(screen.getByRole('button', { name: /sign out|log ?out/i }));

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
    });
    expect(client.getQueryData(['auth-user'])).toBeUndefined();
    expect(client.getQueryData(['onboarding-status', 'u-1'])).toBeUndefined();
    expect(client.getQueryData(['dashboard', 'u-1'])).toBeUndefined();
  });

  it('falls back to scope:"local" sign-out when the server-side call rejects', async () => {
    // First call (default scope) returns an error → falls back to local scope.
    signOutMock.mockResolvedValueOnce({ error: { message: 'network blew up' } });
    signOutMock.mockResolvedValueOnce({ error: null });

    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: /sign out|log ?out/i }));

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });
    expect(signOutMock).toHaveBeenCalledTimes(2);
    expect(signOutMock).toHaveBeenLastCalledWith({ scope: 'local' });
  });
});
