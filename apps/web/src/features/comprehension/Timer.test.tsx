import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timer } from './Timer';

describe('Timer', () => {
  it('shows ~0.0s when startedAt is now', () => {
    render(<Timer startedAt={Date.now()} />);
    // Allow a tiny race between Date.now() in test vs in component.
    expect(screen.getByRole('timer').textContent).toMatch(/^0\.[01]s$/);
  });

  it('shows the elapsed seconds when startedAt is in the past', () => {
    render(<Timer startedAt={Date.now() - 3_500} />);
    expect(screen.getByRole('timer').textContent).toMatch(/^3\.[4-6]s$/);
  });

  it('has an accessible label and a tabular-nums style for stable width', () => {
    render(<Timer startedAt={Date.now()} />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-label', 'Elapsed time');
    expect(timer.className).toMatch(/tabular-nums/);
  });
});
