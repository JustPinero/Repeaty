import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DeckListItem } from './DeckListItem';

function renderItem(props: Partial<Parameters<typeof DeckListItem>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ul>
        <DeckListItem
          id="00000000-0000-0000-0000-000000000001"
          name="Spanish — Starter (A1)"
          languageCode="es"
          cefrLevel="A1"
          cardCount={30}
          source="bundled"
          {...props}
        />
      </ul>
    </MemoryRouter>,
  );
}

describe('DeckListItem', () => {
  it('renders the deck name', () => {
    renderItem();
    expect(screen.getByText(/Spanish — Starter \(A1\)/)).toBeInTheDocument();
  });

  it('renders the card count', () => {
    renderItem({ cardCount: 30 });
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });

  it('shows the CEFR level as a badge', () => {
    renderItem({ cefrLevel: 'A1' });
    expect(screen.getByText('A1')).toBeInTheDocument();
  });

  it('marks bundled decks with a "starter" or "bundled" tag', () => {
    renderItem({ source: 'bundled', name: 'Generic Deck' });
    // Source tag is labelled distinctly so it doesn't collide with the deck name.
    const tag = screen.getByLabelText(/source/i);
    expect(tag).toHaveTextContent(/starter|bundled/i);
  });

  it('links to the review session for the deck (/app/decks/:id/review)', () => {
    renderItem({ id: 'abc-123' });
    const link = screen.getByRole('link', { name: /Spanish — Starter/ });
    expect(link).toHaveAttribute('href', '/app/decks/abc-123/review');
  });
});
