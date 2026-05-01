import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const fromMock = vi.fn();
const invokeMock = vi.fn();
const profileMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthUser: () => ({ user: { id: 'u-1' }, isLoading: false }),
  useProfile: () => profileMock(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

import { GenerateLessonPage } from './GenerateLessonPage';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/generate" element={<GenerateLessonPage />} />
          <Route path="/app" element={<div data-testid="dashboard">dash</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PRO = {
  id: 'u-1',
  display_name: 'Ben',
  email: 'ben@example.com',
  native_language_code: 'en-US',
  tier: 'pro' as const,
  is_admin: false,
};
const FREE = { ...PRO, tier: 'free' as const };

function setUserLanguagesQuery(rows: Array<{ language_code: string; cefr_level: string }>) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'user_languages') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: rows, error: null }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe('GenerateLessonPage', () => {
  beforeEach(() => {
    fromMock.mockReset();
    invokeMock.mockReset();
    profileMock.mockReset();
    navigateMock.mockReset();
    invokeMock.mockResolvedValue({
      data: {
        data: { deck_id: 'deck-new', deck_name: 'New deck', card_count: 12 },
        error: null,
      },
      error: null,
    });
  });

  it('shows the Pro-required explainer for free-tier users', () => {
    profileMock.mockReturnValue({ profile: FREE, isLoading: false });
    setUserLanguagesQuery([]);
    renderAt('/app/generate');
    expect(screen.getByText(/Pro feature/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate/i })).toBeNull();
  });

  it('shows a loading state while the profile is loading', () => {
    profileMock.mockReturnValue({ profile: null, isLoading: true });
    setUserLanguagesQuery([]);
    renderAt('/app/generate');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders the form with a target-language select pre-populated from user_languages', async () => {
    profileMock.mockReturnValue({ profile: PRO, isLoading: false });
    setUserLanguagesQuery([
      { language_code: 'es', cefr_level: 'A1' },
      { language_code: 'fr', cefr_level: 'B1' },
    ]);
    renderAt('/app/generate');
    await waitFor(() => {
      expect(screen.getByLabelText(/target language/i)).toBeInTheDocument();
    });
    const sel = screen.getByLabelText(/target language/i) as HTMLSelectElement;
    await waitFor(() => expect(sel.value).toBe('es'));
    expect(screen.getByLabelText(/topic hint/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('caps topic_hint input at 200 chars (input maxlength)', async () => {
    profileMock.mockReturnValue({ profile: PRO, isLoading: false });
    setUserLanguagesQuery([{ language_code: 'es', cefr_level: 'A1' }]);
    renderAt('/app/generate');
    await waitFor(() => {
      expect(screen.getByLabelText(/topic hint/i)).toBeInTheDocument();
    });
    const input = screen.getByLabelText(/topic hint/i) as HTMLInputElement;
    expect(input).toHaveAttribute('maxlength', '200');
  });

  it('on submit invokes generate-lesson with the form values', async () => {
    profileMock.mockReturnValue({ profile: PRO, isLoading: false });
    setUserLanguagesQuery([{ language_code: 'es', cefr_level: 'A1' }]);
    const user = userEvent.setup();
    renderAt('/app/generate');
    await waitFor(() => {
      expect(screen.getByLabelText(/target language/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/topic hint/i), 'food');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'generate-lesson',
        expect.objectContaining({
          body: expect.objectContaining({
            language_code: 'es',
            topic_hint: 'food',
            card_count: 12,
          }),
        }),
      );
    });
    expect(navigateMock).toHaveBeenCalledWith('/app/decks/deck-new/review', {
      replace: true,
    });
  });

  it('surfaces a friendly message on RATE_LIMITED', async () => {
    profileMock.mockReturnValue({ profile: PRO, isLoading: false });
    setUserLanguagesQuery([{ language_code: 'es', cefr_level: 'A1' }]);
    invokeMock.mockResolvedValue({
      data: { data: null, error: { code: 'RATE_LIMITED', message: 'cap exceeded' } },
      error: null,
    });
    const user = userEvent.setup();
    renderAt('/app/generate');
    await waitFor(() => {
      expect(screen.getByLabelText(/target language/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/today's lesson generations/i);
    });
  });

  it('surfaces a friendly message on UPSTREAM_TIMEOUT', async () => {
    profileMock.mockReturnValue({ profile: PRO, isLoading: false });
    setUserLanguagesQuery([{ language_code: 'es', cefr_level: 'A1' }]);
    invokeMock.mockResolvedValue({
      data: { data: null, error: { code: 'UPSTREAM_TIMEOUT', message: 'aborted' } },
      error: null,
    });
    const user = userEvent.setup();
    renderAt('/app/generate');
    await waitFor(() => {
      expect(screen.getByLabelText(/target language/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/took too long/i);
    });
  });
});
