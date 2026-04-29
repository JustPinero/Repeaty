import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// App now mounts the router (which transitively loads pages → @/lib/supabase →
// loadEnv at module init). In jsdom we don't have VITE_* env set, so we stub
// the router and the supabase client. The test just verifies the App-level
// heading + that the router mounts.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

vi.mock('@/routes', () => ({
  AppRouter: () => <div data-testid="router-stub">router</div>,
}));

import App from './App';

describe('App', () => {
  it('renders the "Repeat after Peaty." tagline as a heading', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /Repeat after Peaty\./i });
    expect(heading).toBeInTheDocument();
  });

  it('mounts the router under the auth provider', () => {
    render(<App />);
    expect(screen.getByTestId('router-stub')).toBeInTheDocument();
  });
});
