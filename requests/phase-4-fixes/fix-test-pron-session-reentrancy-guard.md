# Fix — Pin the re-entrancy guard contract on `usePronunciationSession`

**Source audit:** TestAudit Phase 4 (T-1)
**Severity:** Warning (carry-forward of Phase-3 T-3 / W-1 pattern)

## What's missing

`usePronunciationSession.submitRecording` has a `submittingRef` guard at lines 90, 111-115, 142 — correct implementation, mirrors the Phase-3-fix pattern from `useReviewSession` and `useComprehensionSession`. But no test in `usePronunciationSession.test.ts` asserts that a second concurrent call returns the in-flight result instead of double-uploading + double-inserting.

## Why it matters

Without a pinning test, a future refactor that drops the guard (e.g. swap to React 19 `useTransition`, treat the ref as redundant, swap the hook to `useMutation`) will not be caught. The guard exists because `submitRecording` issues a Storage upload AND an Edge Function call — a re-entrant call would double the OpenAI Whisper bill per duplicated press AND insert two `pronunciation_attempts` rows for one recording. Phase 3 W-1 is the precedent for taking this seriously.

## Proposed test

Add to `apps/web/src/features/pronunciation/usePronunciationSession.test.ts`:

```ts
it('rejects a second concurrent submitRecording (re-entrancy guard)', async () => {
  setupSupabase();
  // Slow the upload so we can hit the in-flight guard.
  uploadMock.mockImplementation(
    () => new Promise((r) => setTimeout(() => r('user-aaa/card-1/x.webm'), 50)),
  );
  const { result } = renderHook(() => usePronunciationSession('deck-1'), {
    wrapper: makeWrapper(),
  });
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  let firstResolved: unknown;
  await act(async () => {
    const a = result.current.submitRecording(FAKE_BLOB);
    const b = result.current.submitRecording(FAKE_BLOB);
    firstResolved = await a;
    await b.catch(() => undefined); // either resolves with cached pendingResult or rejects
  });

  expect(uploadMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(result.current.pendingResult).not.toBeNull();
  expect(firstResolved).toBeDefined();
});
```

## Files to touch

- `apps/web/src/features/pronunciation/usePronunciationSession.test.ts` — add the test above.

## Acceptance criteria

- [ ] The test passes against the current implementation (pins the existing `submittingRef`).
- [ ] If the `submittingRef` guard is removed in a future refactor, the test fails with `uploadMock` called twice.
- [ ] No production code change is required — this is test debt, not a bug.
