import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step2NativeLanguage } from './Step2NativeLanguage';

describe('Step2NativeLanguage', () => {
  it('renders an associated label and a select control', () => {
    render(<Step2NativeLanguage onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByLabelText(/native language/i)).toBeInTheDocument();
  });

  it('includes English (US) and Spanish among the options', () => {
    render(<Step2NativeLanguage onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('option', { name: /English \(US\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Spanish$/ })).toBeInTheDocument();
  });

  it('keeps the Next button disabled until a language is picked', async () => {
    const user = userEvent.setup();
    render(<Step2NativeLanguage onNext={vi.fn()} onBack={vi.fn()} />);
    const next = screen.getByRole('button', { name: /next|continue/i });
    expect(next).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/native language/i), 'en-US');
    expect(next).toBeEnabled();
  });

  it('passes the chosen language code to onNext', async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(<Step2NativeLanguage onNext={onNext} onBack={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText(/native language/i), 'es');
    await user.click(screen.getByRole('button', { name: /next|continue/i }));
    expect(onNext).toHaveBeenCalledWith('es');
  });

  it('calls onBack when the Back button is clicked', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<Step2NativeLanguage onNext={vi.fn()} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
