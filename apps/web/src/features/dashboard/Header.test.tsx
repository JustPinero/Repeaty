import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const signOutMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
  },
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
  return render(
    <MemoryRouter>
      <Header {...props} />
    </MemoryRouter>,
  );
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
});
