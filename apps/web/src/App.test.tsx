import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the "Repeat after Peaty." tagline as a heading', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /Repeat after Peaty\./i });
    expect(heading).toBeInTheDocument();
  });
});
