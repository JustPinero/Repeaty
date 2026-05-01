import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
const fromMock = vi.fn();
const invokeMock = vi.fn();
const profileMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock('@/features/auth', () => ({
  useProfile: () => profileMock(),
  useAuthUser: () => ({ user: { id: 'admin-1' }, isLoading: false }),
}));

import { AdminPage } from './AdminPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ADMIN_PROFILE = {
  id: 'admin-1',
  display_name: 'Admin',
  email: 'admin@example.com',
  native_language_code: 'en-US',
  tier: 'admin' as const,
  is_admin: true,
};

const ROWS = [
  {
    id: 'admin-1',
    display_name: 'Admin',
    email: 'admin@example.com',
    tier: 'admin',
    is_admin: true,
    created_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'user-2',
    display_name: 'Ben',
    email: 'ben@example.com',
    tier: 'free',
    is_admin: false,
    created_at: '2026-04-02T00:00:00Z',
  },
];

function setProfilesQuery(rows: typeof ROWS, error: { message: string } | null = null) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      order: () => ({
        limit: () => Promise.resolve({ data: rows, error }),
      }),
    }),
  }));
}

describe('AdminPage', () => {
  beforeEach(() => {
    fromMock.mockReset();
    invokeMock.mockReset();
    profileMock.mockReset();
    profileMock.mockReturnValue({ profile: ADMIN_PROFILE, isLoading: false });
    invokeMock.mockResolvedValue({
      data: { data: { log_id: 'log-1' }, error: null },
      error: null,
    });
  });

  it('lists profiles with their tier badge', async () => {
    setProfilesQuery(ROWS);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/ben@example.com/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/admin@example.com/i)).toBeInTheDocument();
  });

  it('disables the cycle button for the caller (no self-flip)', async () => {
    setProfilesQuery(ROWS);
    renderPage();
    const selfBtn = await screen.findByRole('button', { name: /Cycle tier for admin@example.com/i });
    expect(selfBtn).toBeDisabled();
  });

  it('clicking another user’s cycle button invokes flip-tier with the next tier', async () => {
    setProfilesQuery(ROWS);
    const user = userEvent.setup();
    renderPage();
    const benBtn = await screen.findByRole('button', { name: /Cycle tier for ben@example.com/i });
    await user.click(benBtn);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'flip-tier',
        expect.objectContaining({
          body: expect.objectContaining({
            target_user_id: 'user-2',
            new_tier: 'pro',
          }),
        }),
      );
    });
  });

  it('surfaces the Edge Function error when flip-tier fails', async () => {
    invokeMock.mockResolvedValue({
      data: {
        data: null,
        error: { code: 'FORBIDDEN_TIER', message: 'Caller is not an admin' },
      },
      error: null,
    });
    setProfilesQuery(ROWS);
    const user = userEvent.setup();
    renderPage();
    const benBtn = await screen.findByRole('button', { name: /Cycle tier for ben@example.com/i });
    await user.click(benBtn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not an admin/i);
    });
  });
});
