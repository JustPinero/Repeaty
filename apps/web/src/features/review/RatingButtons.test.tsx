import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RatingButtons } from './RatingButtons';
import { Rating } from '@repeaty/shared';

describe('RatingButtons', () => {
  it('renders all four rating buttons with accessible names', () => {
    render(<RatingButtons onRate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^again$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^hard$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^good$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^easy$/i })).toBeInTheDocument();
  });

  it('all four buttons are individually keyboard-tabbable', () => {
    render(<RatingButtons onRate={vi.fn()} />);
    for (const name of ['Again', 'Hard', 'Good', 'Easy']) {
      const btn = screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
      expect(btn.tabIndex).not.toBe(-1);
    }
  });

  it('calls onRate with the correct Rating on click', async () => {
    const onRate = vi.fn();
    const user = userEvent.setup();
    render(<RatingButtons onRate={onRate} />);

    await user.click(screen.getByRole('button', { name: /^again$/i }));
    expect(onRate).toHaveBeenLastCalledWith(Rating.Again);

    await user.click(screen.getByRole('button', { name: /^hard$/i }));
    expect(onRate).toHaveBeenLastCalledWith(Rating.Hard);

    await user.click(screen.getByRole('button', { name: /^good$/i }));
    expect(onRate).toHaveBeenLastCalledWith(Rating.Good);

    await user.click(screen.getByRole('button', { name: /^easy$/i }));
    expect(onRate).toHaveBeenLastCalledWith(Rating.Easy);

    expect(onRate).toHaveBeenCalledTimes(4);
  });

  it('mapping keyboard 1/2/3/4 to ratings (a11y power-user shortcut)', async () => {
    const onRate = vi.fn();
    const user = userEvent.setup();
    render(<RatingButtons onRate={onRate} />);

    await user.keyboard('1');
    expect(onRate).toHaveBeenLastCalledWith(Rating.Again);
    await user.keyboard('2');
    expect(onRate).toHaveBeenLastCalledWith(Rating.Hard);
    await user.keyboard('3');
    expect(onRate).toHaveBeenLastCalledWith(Rating.Good);
    await user.keyboard('4');
    expect(onRate).toHaveBeenLastCalledWith(Rating.Easy);
  });

  it('disables all four buttons when disabled is true (e.g. while submitting)', () => {
    render(<RatingButtons onRate={vi.fn()} disabled />);
    for (const name of ['Again', 'Hard', 'Good', 'Easy']) {
      const btn = screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
      expect(btn).toBeDisabled();
    }
  });
});
