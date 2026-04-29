import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step3TargetLanguage } from './Step3TargetLanguage';

describe('Step3TargetLanguage', () => {
  it('renders both target-language and CEFR-level controls with labels', () => {
    render(<Step3TargetLanguage onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByLabelText(/target language|i want to learn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/level|cefr/i)).toBeInTheDocument();
  });

  it('exposes all 7 target languages and all 6 CEFR levels', () => {
    render(<Step3TargetLanguage onSubmit={vi.fn()} onBack={vi.fn()} />);
    for (const code of ['es', 'fr', 'de', 'it', 'ru', 'ja', 'zh']) {
      expect(screen.getByRole('option', { name: new RegExp(code, 'i') })).toBeInTheDocument();
    }
    for (const lvl of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
      expect(screen.getByRole('option', { name: new RegExp(`^${lvl}$`) })).toBeInTheDocument();
    }
  });

  it('keeps the submit button disabled until both fields are picked', async () => {
    const user = userEvent.setup();
    render(<Step3TargetLanguage onSubmit={vi.fn()} onBack={vi.fn()} />);
    const submit = screen.getByRole('button', { name: /finish|done|complete/i });
    expect(submit).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/target language|i want to learn/i), 'es');
    expect(submit).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/level|cefr/i), 'A1');
    expect(submit).toBeEnabled();
  });

  it('calls onSubmit with a single target { language_code, cefr_level }', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Step3TargetLanguage onSubmit={onSubmit} onBack={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText(/target language|i want to learn/i), 'fr');
    await user.selectOptions(screen.getByLabelText(/level|cefr/i), 'B1');
    await user.click(screen.getByRole('button', { name: /finish|done|complete/i }));
    expect(onSubmit).toHaveBeenCalledWith([{ language_code: 'fr', cefr_level: 'B1' }]);
  });
});
