import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const profileMock = vi.fn();
vi.mock('@/features/auth', () => ({
  useProfile: () => profileMock(),
}));

import { AdminGuard } from './AdminGuard';

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/app/admin"
          element={
            <AdminGuard>
              <div data-testid="admin-content">admin</div>
            </AdminGuard>
          }
        />
        <Route path="/app" element={<div data-testid="dashboard">dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminGuard', () => {
  it('renders the protected content when profile.is_admin is true', () => {
    profileMock.mockReturnValue({ profile: { is_admin: true }, isLoading: false });
    renderAt('/app/admin');
    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
  });

  it('redirects non-admin users to /app', () => {
    profileMock.mockReturnValue({ profile: { is_admin: false }, isLoading: false });
    renderAt('/app/admin');
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-content')).toBeNull();
  });

  it('shows a loading state while the profile query is in flight', () => {
    profileMock.mockReturnValue({ profile: null, isLoading: true });
    renderAt('/app/admin');
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });

  it('redirects when the profile loads as null (no row)', () => {
    profileMock.mockReturnValue({ profile: null, isLoading: false });
    renderAt('/app/admin');
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });
});
