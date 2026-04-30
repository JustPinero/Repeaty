# Fix Request — BugHunt C-1: CardDetail route is unregistered

## What's wrong
`apps/web/src/routes/index.tsx` does not register `/app/decks/:deckId/cards/:cardId`. The `CardDetail` page (`apps/web/src/pages/CardDetail.tsx`) is implemented and is linked from `ComprehensionSessionPage.tsx:135-141` via the per-card "View card history" link, but the route falls through to the catch-all `'*' → Navigate to /app`. Result: clicking the link silently redirects to the dashboard with no error signal.

## Why it matters
- **Blocking:** Request 3.4's acceptance criterion "Card detail route `/app/decks/:deckId/cards/:cardId` mounts the history panel" is unmet. The per-card history view — a primary deliverable of Phase 3 — is unreachable from the UI.
- **Silent failure:** the catch-all redirect masks the broken-link state. No toast, no 404, no error log. User-side, it just feels like the link "didn't work."
- **Unblock cost is one line.** This is a bug of pure omission — the implementation, page, history component, and integration test all exist and pass.

## Proposed fix

In `apps/web/src/routes/index.tsx`:

```tsx
import CardDetailPage from '@/pages/CardDetail';
// ...
const router = createBrowserRouter([
  // ... unchanged
  {
    path: '/app',
    element: (/* ... unchanged ... */),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'decks', element: <DeckListPage /> },
      { path: 'decks/:deckId/review', element: <ReviewSessionPage /> },
      { path: 'decks/:deckId/comprehension', element: <ComprehensionSessionPage /> },
      { path: 'decks/:deckId/cards/:cardId', element: <CardDetailPage /> }, // ← NEW
      { path: '*', element: <Navigate to="/app" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
```

Order matters: the new entry must precede the `'*'` catch-all in the children array. (It already does as written above.)

Confirm the import path: `CardDetailPage` is the default export of `apps/web/src/pages/CardDetail.tsx` (`export default function CardDetailPage()`).

## Files to touch
- `apps/web/src/routes/index.tsx` — add the import + the route entry

## Acceptance criteria
- A user submitting a comprehension response can click "View card history" and lands on the CardDetail page (no redirect to `/app`)
- The CardDetail page renders the card body + the `<CardComprehensionHistory>` panel for `cardId`
- All existing route tests continue to pass
- (Recommended, paired with TestAudit T-2) `apps/web/src/pages/CardDetail.test.tsx` smoke test exists and passes — see `requests/phase-3-fixes/fix-test-card-detail-smoke.md`
- (Optional) An E2E or integration test that navigates from the comprehension result link to the CardDetail page would close the loop, but is not required for this fix
