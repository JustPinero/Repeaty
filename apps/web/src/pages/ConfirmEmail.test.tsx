import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) =>
        onAuthStateChangeMock(cb),
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

import ConfirmEmailPage from './ConfirmEmail';

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmEmailPage />
    </MemoryRouter>,
  );
}

describe('ConfirmEmailPage', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    navigateMock.mockReset();
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('shows the verifying state on initial render', () => {
    getSessionMock.mockReturnValue(new Promise(() => {})); // pending forever
    renderPage();
    expect(screen.getByText(/one moment/i)).toBeInTheDocument();
  });

  it('redirects to /app when getSession reports an active session', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
      error: null,
    });
    renderPage();
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/app', { replace: true });
    });
  });

  it('redirects to /app when onAuthStateChange fires SIGNED_IN later', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    let cb: ((evt: string, session: unknown) => void) | undefined;
    onAuthStateChangeMock.mockImplementation((c) => {
      cb = c;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    renderPage();
    await waitFor(() => {
      expect(cb).toBeDefined();
    });
    expect(navigateMock).not.toHaveBeenCalled();

    act(() => {
      cb!('SIGNED_IN', { user: { id: 'u-2' } });
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/app', { replace: true });
    });
  });

  it(
    'shows an error after the grace period when no session arrives',
    async () => {
      getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
      renderPage();
      // The grace period in the component is 1500ms; let it really elapse.
      const alert = await screen.findByRole('alert', undefined, { timeout: 3000 });
      expect(alert).toHaveTextContent(/no active session/i);
      expect(navigateMock).not.toHaveBeenCalled();
    },
    5000,
  );

  it('surfaces a getSession error directly', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: 'auth server is down' },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/auth server is down/i);
    });
  });
});
