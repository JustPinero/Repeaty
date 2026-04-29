import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginForm } from './LoginForm';

const signInMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInMock(...args),
    },
  },
}));

function renderForm() {
  return render(
    <MemoryRouter>
      <LoginForm />
    </MemoryRouter>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    signInMock.mockReset();
    signInMock.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null });
  });

  it('renders email and password fields with labels', () => {
    renderForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('calls signInWithPassword with the entered credentials', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.type(screen.getByLabelText(/password/i), 'mypassword');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await vi.waitFor(() => {
      expect(signInMock).toHaveBeenCalledTimes(1);
    });
    expect(signInMock).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'mypassword',
    });
  });

  it('shows an alert with bad-credentials message on failure', async () => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400, name: 'AuthApiError' },
    });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpw');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid login credentials/i);
  });
});
