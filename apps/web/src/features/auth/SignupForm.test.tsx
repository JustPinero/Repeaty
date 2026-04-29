import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SignupForm } from './SignupForm';

const signUpMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => signUpMock(...args),
    },
  },
}));

function renderForm() {
  return render(
    <MemoryRouter>
      <SignupForm />
    </MemoryRouter>,
  );
}

describe('SignupForm', () => {
  beforeEach(() => {
    signUpMock.mockReset();
    signUpMock.mockResolvedValue({ data: { user: null, session: null }, error: null });
  });

  it('renders email and password fields with associated labels', () => {
    renderForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows validation error and does not submit when password is too short', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText(/at least 8/i)).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('calls supabase.auth.signUp once with valid input', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    await vi.waitFor(() => {
      expect(signUpMock).toHaveBeenCalledTimes(1);
    });
    expect(signUpMock).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'longenoughpassword',
    });
  });

  it('surfaces server errors via role="alert"', async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Email already registered', status: 400, name: 'AuthApiError' },
    });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/already registered/i);
  });
});
