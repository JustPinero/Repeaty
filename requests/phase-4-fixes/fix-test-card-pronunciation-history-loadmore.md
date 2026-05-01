# Fix — Pin `Load more` boundary on `CardPronunciationHistory`

**Source audit:** TestAudit Phase 4 (T-3)
**Severity:** Info — copy-paste of the Phase-3 sibling test pattern

## What's missing

`CardComprehensionHistory.test.tsx` (Phase 3) asserts `Load more` is rendered when `data.length === pageSize` and not rendered when `data.length < pageSize`. The new `CardPronunciationHistory.test.tsx` skipped this assertion — the body of the two components is structurally identical (lines 129-133 of the pronunciation file mirror the comprehension component) but the test contract didn't carry forward.

## Why it matters

The pagination boundary is a contract. If a future refactor changes `data.length === limit` to `data.length >= limit` (or to `data.length > pageSize`, etc.), the regression won't be caught until a user with a >20-attempt card sees a missing button.

## Proposed test

Add to `apps/web/src/features/pronunciation/CardPronunciationHistory.test.tsx`:

```ts
it('renders the Load more button at exactly pageSize results', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: `a${i}`, similarity_score: 0.5, whisper_transcript: 't',
    audio_storage_path: null, created_at: '2026-04-01T00:00:00Z',
  }));
  setSelect(rows);
  renderWithClient(<CardPronunciationHistory cardId="card-1" pageSize={5} />);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });
});

it('does not render Load more when fewer results than pageSize', async () => {
  const rows = Array.from({ length: 2 }, (_, i) => ({
    id: `a${i}`, similarity_score: 0.5, whisper_transcript: 't',
    audio_storage_path: null, created_at: '2026-04-01T00:00:00Z',
  }));
  setSelect(rows);
  renderWithClient(<CardPronunciationHistory cardId="card-1" pageSize={5} />);
  await waitFor(() => {
    expect(screen.getByTestId('card-pronunciation-history')).toBeInTheDocument();
  });
  expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
});
```

## Files to touch

- `apps/web/src/features/pronunciation/CardPronunciationHistory.test.tsx` — add the two tests above.

## Acceptance criteria

- [ ] Both tests pass against the current implementation.
- [ ] The pagination boundary is pinned so future changes to `data.length === limit` are caught.
