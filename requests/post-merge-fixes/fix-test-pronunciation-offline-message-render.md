# Fix — `PronunciationSessionPage` offline-message string isn't pinned in a render test

**Severity:** Medium (test-audit-debt-cleanup Med-1)
**Originating audit:** test-audit on the debt-cleanup branch

## Root cause

`fix-bug-pronunciation-offline-message.md` (deleted on this branch) added the user-facing string `"Saved offline. Your score will land when you're back online."` to `PronunciationSessionPage.tsx:42`, gated by `isOfflinePronunciationError(err)`.

The hook side is well-tested (`usePronunciationSession.test.ts` `offline: enqueues to the Dexie queue and throws OFFLINE_PRONUNCIATION_UNSUPPORTED`). The page-side render — where the user actually sees the string — is not asserted in any `.test.tsx`.

A future copy-edit, an ill-considered branch change in `handleRecorded`, or a refactor that moves `isOfflinePronunciationError` could silently drop the message. The hook would still throw the typed error; the page would render the wrong fallback (or nothing).

## Acceptance criteria

- [ ] New test file or added cases in an existing `PronunciationSessionPage.test.tsx`. Choose by what's already in the repo.
- [ ] One render-time assertion: stub `usePronunciationSession` so `submitRecording` rejects with `new Error(OFFLINE_PRONUNCIATION_UNSUPPORTED)` (or use the `isOfflinePronunciationError` helper input shape), wire the page through `handleRecorded(blob)`, assert the string `/saved offline/i` appears with `role="alert"`.
- [ ] One contrast assertion: a non-offline error ("upload broke") renders that message instead.
- [ ] No code changes to `PronunciationSessionPage` itself.

## Files to touch

- `apps/web/src/features/pronunciation/PronunciationSessionPage.test.tsx` (new or extended)
