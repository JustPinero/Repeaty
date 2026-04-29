import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step1Name } from './Step1Name';

describe('Step1Name', () => {
  it('renders an associated label for the display-name input', () => {
    render(<Step1Name onNext={vi.fn()} />);
    expect(screen.getByLabelText(/name|what should we call you/i)).toBeInTheDocument();
  });

  it('keeps the submit button disabled until a non-empty name is entered', async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(<Step1Name onNext={onNext} />);
    const submit = screen.getByRole('button', { name: /next|continue/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/name|what should we call you/i), 'Ben');
    expect(submit).toBeEnabled();
  });

  it('treats whitespace-only input as empty', async () => {
    const user = userEvent.setup();
    render(<Step1Name onNext={vi.fn()} />);
    await user.type(screen.getByLabelText(/name|what should we call you/i), '   ');
    expect(screen.getByRole('button', { name: /next|continue/i })).toBeDisabled();
  });

  it('passes the trimmed name to onNext on submit', async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(<Step1Name onNext={onNext} />);
    await user.type(screen.getByLabelText(/name|what should we call you/i), '  Ben  ');
    await user.click(screen.getByRole('button', { name: /next|continue/i }));
    expect(onNext).toHaveBeenCalledWith('Ben');
  });

  it('hydrates with initialValue', () => {
    render(<Step1Name initialValue="Justin" onNext={vi.fn()} />);
    expect(screen.getByLabelText(/name|what should we call you/i)).toHaveValue('Justin');
  });
});
