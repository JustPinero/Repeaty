# Fix Request — TestAudit T-2: CardDetail smoke test

## What's missing
`apps/web/src/pages/CardDetail.tsx` was shipped with a tests-after escape claimed as "smoke-only", but no test file exists. The page mounts at `/app/decks/:deckId/cards/:cardId` (per Request 3.4 and the page itself) and renders the comprehension history panel. Without any test, the page is wholly unverified.

This pairs with BugHunt C-1 (the route is not registered in the router), so right now CardDetail is both unreachable AND untested.

## Why it matters
- The "smoke-only" escape requires the test to exist before "done" — it doesn't.
- Phase 5's Pro-tier feedback-text rendering will land here. Adding the smoke harness now makes Phase 5's TDD trivial.
- The page is the only UI surface for the per-card history view (Request 3.4's main user-facing deliverable). A regression in the page's data-loading branches would silently break the feature.

## Proposed test (sketch)

Create `apps/web/src/pages/CardDetail.test.tsx` with:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import React from 'react';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));
vi.mock('@/features/auth', () => ({
  useAuthUser: () => ({ user: { id: 'u-1', email: 'a@example.com' }, isLoading: false }),
}));
vi.mock('@/features/comprehension/CardComprehensionHistory', () => ({
  CardComprehensionHistory: ({ cardId }: { cardId: string }) =>
    React.createElement('div', { 'data-testid': 'history-mock' }, `history:${cardId}`),
}));

import CardDetailPage from './CardDetail';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client },
      React.createElement(MemoryRouter, { initialEntries: [path] }, children));
  }
  return render(
    <Routes>
      <Route path="/app/decks/:deckId/cards/:cardId" element={<CardDetailPage />} />
    </Routes>,
    { wrapper: Wrapper },
  );
}

function mockCard(card: object | null) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: card, error: null }) }),
    }),
  }));
}

describe('CardDetailPage', () => {
  beforeEach(() => { fromMock.mockReset(); });

  it('shows loading then the card body and the history slot when the query resolves', async () => {
    mockCard({
      id: 'c1', target_text: 'hola', native_text: 'hello', ipa: 'ˈo.la',
      example_sentence_target: '¡Hola, mundo!', example_sentence_native: 'Hello, world!',
      language_code: 'es',
    });
    renderAt('/app/decks/d1/cards/c1');
    await waitFor(() => expect(screen.getByText('hola')).toBeInTheDocument());
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText(/ˈo\.la/)).toBeInTheDocument();
    expect(screen.getByText('¡Hola, mundo!')).toBeInTheDocument();
    expect(screen.getByTestId('history-mock')).toHaveTextContent('history:c1');
  });

  it('renders "Card not found" when the card query returns null', async () => {
    mockCard(null);
    renderAt('/app/decks/d1/cards/missing');
    await waitFor(() => expect(screen.getByText(/card not found/i)).toBeInTheDocument());
  });

  it('renders an alert when the query errors', async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'rls denied' } }) }),
      }),
    }));
    renderAt('/app/decks/d1/cards/c1');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
  });

  it('always shows the "Back to deck" link', () => {
    mockCard(null);
    renderAt('/app/decks/d1/cards/c1');
    const back = screen.getByRole('link', { name: /back to deck/i });
    expect(back).toHaveAttribute('href', '/app/decks/d1');
  });
});
```

## Files to touch
- New: `apps/web/src/pages/CardDetail.test.tsx`

## Acceptance criteria
- 4 tests as sketched, all passing
- The history-panel child is mocked so this remains a CardDetail-scoped smoke test (not an integration-style coupling)
- The `getByText(/card not found/i)` test will guard against a future regression that drops the empty-state branch
- File runs as part of `pnpm --filter @repeaty/web test` in <500ms
