# Fix Request — BugHunt W-2: Empty deck renders broken UX, not the spec'd empty-state

## What's wrong
`useComprehensionSession.ts:100` defines:

```ts
const isComplete = !isLoading && !isError && hydrated && index >= total && total > 0;
```

The `&& total > 0` guard is correct (don't flash "Session complete" on a deck the user never started), but the page (`ComprehensionSessionPage.tsx`) has no branch for the `total === 0` state:

- `isLoading` — handled
- `isError` — handled (incl. `DECK_NOT_FOUND`)
- `isComplete` — handled (only fires when `total > 0`)
- `total === 0 AND not loading AND not error` — falls through to the prompt+input render with `currentCard = null`. The user sees an empty card prompt and a Submit button; clicking with text fires `submitResponse` which throws "no current card" inside the hook.

Request 3.2's acceptance criterion: "Empty queue → 'Nothing due — try again later.' (consistent with review session)" — unmet.

## Why it matters
- **Today** the bundled decks all have ≥30 cards, so this state is unreachable in practice. But:
  - **Phase 5** AI-generated decks have a `card_count: 5–25` range; a degraded LLM response could yield 0 cards.
  - **Phase 5** imported decks could have all cards soft-deleted.
  - **Phase 6** offline replay could land an empty deck during a transient state.
- The contract gap is exactly the kind of latent rot a future caller hits. The review session has the matching empty-state; comprehension should too.
- It's two lines of code and one test.

## Proposed fix

In `apps/web/src/features/comprehension/ComprehensionSessionPage.tsx`, after the `isComplete` branch and before the main render:

```tsx
if (session.progress.total === 0) {
  return (
    <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
      <div className="rounded-xl bg-white shadow-sm p-8 text-center max-w-md space-y-3">
        <h1 className="text-xl font-semibold">Nothing to drill yet</h1>
        <p className="text-stone-600">
          This deck has no cards. Try another deck or check back later.
        </p>
        <Link to="/app/decks" className="mt-2 inline-block underline">
          Back to your decks
        </Link>
      </div>
    </main>
  );
}
```

(Match the `ReviewSessionPage` empty-state styling exactly — copy the corresponding branch from `ReviewSessionPage.tsx` for visual consistency.)

## Files to touch
- `apps/web/src/features/comprehension/ComprehensionSessionPage.tsx` — add the empty-state branch
- `apps/web/src/features/comprehension/ComprehensionSessionPage.test.tsx` — add a test:

```ts
it('renders an empty-state when the deck has no cards', () => {
  useComprehensionSessionMock.mockReturnValue({
    isLoading: false, isError: false, error: null,
    isComplete: false,
    currentCard: null,
    pendingResult: null,
    progress: { reviewed: 0, remaining: 0, total: 0, averageScore: 0, averageResponseMs: 0 },
    submitResponse: vi.fn(),
    next: vi.fn(),
  });
  renderAt('/app/decks/empty/comprehension');
  expect(screen.getByText(/nothing to drill|no cards/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
});
```

## Acceptance criteria
- A deck with `total === 0` renders an empty-state message + a back-link, not a broken prompt+input
- No Submit button is shown in this state
- `submitResponse` cannot be invoked from the rendered UI in this state (no form to submit)
- The new test passes; all existing tests pass
