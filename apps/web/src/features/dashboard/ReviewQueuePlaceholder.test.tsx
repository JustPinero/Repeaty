import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewQueuePlaceholder } from './ReviewQueuePlaceholder';

describe('ReviewQueuePlaceholder', () => {
  it('says zero cards are due', () => {
    render(<ReviewQueuePlaceholder />);
    expect(screen.getByText(/0 cards due|nothing due|no cards/i)).toBeInTheDocument();
  });

  it('hints that bundled decks land in Phase 2', () => {
    render(<ReviewQueuePlaceholder />);
    expect(screen.getByText(/Phase 2/i)).toBeInTheDocument();
  });
});
