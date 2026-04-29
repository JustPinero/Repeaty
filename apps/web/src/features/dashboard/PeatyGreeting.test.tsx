import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeatyGreeting } from './PeatyGreeting';

describe('PeatyGreeting', () => {
  it('greets the user by display name', () => {
    render(<PeatyGreeting displayName="Ben" />);
    expect(
      screen.getByRole('heading', { name: /Hi.*Ben/i }),
    ).toBeInTheDocument();
  });

  it('falls back to a friendly default when display name is null', () => {
    render(<PeatyGreeting displayName={null} />);
    expect(
      screen.getByRole('heading', { name: /Hi(,|!| there)/i }),
    ).toBeInTheDocument();
  });

  it('renders the Peaty illustration with meaningful alt text', () => {
    render(<PeatyGreeting displayName="Ben" />);
    const img = screen.getByAltText(/Peaty.*(parrot|wav|hello)/i);
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toMatch(/peat-start\.jpg$/);
  });
});
