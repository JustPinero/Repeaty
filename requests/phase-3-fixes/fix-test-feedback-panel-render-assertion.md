# Fix Request — TestAudit T-1: FeedbackPanel render assertion

## What's missing
Request 3.5's acceptance criterion "ComprehensionSessionPage shows the feedback under the result when bucket ≠ 'perfect' — `ComprehensionSessionPage.test.tsx`" has no corresponding test. The page renders `<FeedbackPanel>` unconditionally inside the `result` branch, but no test asserts that canned-text appears for `'close'` or `'miss'` results, or that `'perfect'` results suppress it.

## Why it matters
A regression that wraps the FeedbackPanel in a wrong condition (e.g. `result.bucket === 'miss'` only, hiding `'close'`-bucket coaching) would not be caught. Phase 5 will swap `useFeedback`'s body for an Edge Function call — without this assertion, the Phase 5 wiring change can silently skip rendering during loading, no test would fail. This is the single largest test-coverage hole in the comprehension session UI.

## Proposed test (sketch)

In `apps/web/src/features/comprehension/ComprehensionSessionPage.test.tsx`, add:

```ts
it('renders FeedbackPanel canned text when pendingResult.bucket is "close"', () => {
  useComprehensionSessionMock.mockReturnValue({
    isLoading: false, isError: false, error: null, isComplete: false,
    currentCard: { id: 'c1', target_text: 'hola', native_text: 'hello', language_code: 'es' },
    pendingResult: {
      cardId: 'c1', score: 75, bucket: 'close', responseMs: 4000, similarity: 0.85, response: 'helo',
    },
    progress: baseProgress,
    submitResponse: vi.fn(),
    next: vi.fn(),
  });
  renderAt('/app/decks/deck-1/comprehension');
  // The "close" bucket canned text in en is "Nearly there. Watch the spelling — small details count."
  expect(screen.getByText(/nearly|spelling|details/i)).toBeInTheDocument();
  expect(screen.getByRole('status')).toBeInTheDocument(); // FeedbackPanel renders role="status"
});

it('renders FeedbackPanel canned text when pendingResult.bucket is "miss"', () => {
  // ... same shape with bucket: 'miss', score: 30, response: 'xxx'
  // Assert that the "Keep at it" / "not it yet" miss-bucket text is present.
  expect(screen.getByText(/not it yet|keep at it/i)).toBeInTheDocument();
});

it('does NOT render FeedbackPanel for "perfect" bucket', () => {
  // ... pendingResult with bucket: 'perfect', score: 100
  // The FeedbackPanel returns null when text is null. role="status" should not appear.
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
```

The test must NOT mock `useFeedback` — let the real canned-text lookup run so that the wiring (panel + hook + canned-text) is exercised end-to-end at the component level.

## Files to touch
- `apps/web/src/features/comprehension/ComprehensionSessionPage.test.tsx` — add three describe-level tests

## Acceptance criteria
- A test asserts `screen.getByText(/nearly|spelling|details/i)` for `bucket: 'close'`
- A test asserts a similar miss-bucket canned phrase for `bucket: 'miss'`
- A test asserts the panel is hidden for `bucket: 'perfect'`
- All three pass against the current implementation, and would fail if the FeedbackPanel were removed or wrongly conditioned
- No additional mocks beyond the existing `useComprehensionSession` mock
