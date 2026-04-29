import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

const useAuthUserMock = vi.fn();

vi.mock('./useAuthUser', () => ({
  useAuthUser: () => useAuthUserMock(),
}));

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <div>Protected content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    useAuthUserMock.mockReset();
  });

  it('renders nothing while auth is loading (no flash of either page)', () => {
    useAuthUserMock.mockReturnValue({ user: null, isLoading: true });
    renderAt('/app');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    useAuthUserMock.mockReturnValue({ user: null, isLoading: false });
    renderAt('/app');
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders the protected content when a user is present', () => {
    useAuthUserMock.mockReturnValue({
      user: { id: 'u-1', email: 'a@example.com' },
      isLoading: false,
    });
    renderAt('/app');
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
