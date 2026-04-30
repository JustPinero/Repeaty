import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useDueCardsMock = vi.fn();

vi.mock('./useDueCards', () => ({
  useDueCards: () => useDueCardsMock(),
}));

import { ReviewQueue } from './ReviewQueue';

function renderQueue() {
  return render(
    <MemoryRouter>
      <ReviewQueue />
    </MemoryRouter>,
  );
}

describe('ReviewQueue', () => {
  beforeEach(() => {
    useDueCardsMock.mockReset();
  });

  it('shows a loading state', () => {
    useDueCardsMock.mockReturnValue({
      isLoading: true,
      isError: false,
      error: null,
      totalDue: 0,
      totalNew: 0,
      topDeck: null,
    });
    renderQueue();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows "Nothing due" when both totals are 0', () => {
    useDueCardsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      totalDue: 0,
      totalNew: 0,
      topDeck: null,
    });
    renderQueue();
    expect(screen.getByText(/nothing due|all caught up/i)).toBeInTheDocument();
  });

  it('shows the due count and links to the top deck review', () => {
    useDueCardsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      totalDue: 7,
      totalNew: 12,
      topDeck: {
        deckId: 'd-es',
        deckName: 'Spanish — Starter (A1)',
        languageCode: 'es',
        dueCount: 5,
        newCount: 8,
      },
    });
    renderQueue();
    // Total cards-to-review surface (7 due + 12 new = 19) appears.
    expect(screen.getByText(/7/)).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /start|review|spanish/i });
    expect(link).toHaveAttribute('href', '/app/decks/d-es/review');
  });

  it('renders an alert when the underlying query fails', () => {
    useDueCardsMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error('network blew up'),
      totalDue: 0,
      totalNew: 0,
      topDeck: null,
    });
    renderQueue();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/network blew up/i)).toBeInTheDocument();
  });
});
