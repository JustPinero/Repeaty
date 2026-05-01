# TestAudit — Phase 4 (Pronunciation Mode)

Mode: quick. Scope: 48 files modified between `main` and `phase-4-pronunciation` HEAD (14 commits).

## Overall grade: **B**

The phase carries forward the strong test discipline established in 3.x. Every acceptance criterion in 4.1–4.6 has at least one named test; the platform mic adapter ships with an end-to-end mock-driven suite (`web.test.ts`, 17 cases including no-getUserMedia/no-MediaRecorder/no-PermissionAPI fallbacks, blob assembly, track cleanup); the score-pronunciation Edge Function is tested via a pure handler factory (`handler.test.ts`, 9 Deno cases including OPTIONS preflight, 401×2, 400, 404, 403, 504-on-AbortError, 502-on-Whisper-failure, 502-on-download-null, and a happy-path that asserts the structured log line); the storage helper is unit-tested for path shape, mime→ext mapping, the 10MB cap, and supabase error propagation; the bucket RLS integration test asserts both upload-cross-prefix denial *and* read/list-cross-prefix denial; the retention integration test asserts both the free-tier reap and the Pro-tier preservation, plus a second run for idempotency.

The session hook (`usePronunciationSession.test.ts`, 7 cases) carries forward the Phase-3-fix re-entrancy guard pattern correctly — a `submittingRef` is in place and the test surface covers `submitRecording → upload → invoke → pendingResult`, `next() advance`, `DECK_NOT_FOUND`, upload-failure bubble, edge-failure bubble, single-card completion+average, and the empty-deck `total === 0` branch. This is the cleanest hook test in the codebase to date.

Three material gaps:

1. **No re-entrancy test on `submitRecording`.** The hook *has* the `submittingRef` guard (lines 90, 111-115, 142) but no test asserts that a second concurrent call returns the in-flight result instead of double-uploading + double-inserting. The same gap that became Phase-3 T-3 / W-1 is back, structurally. Cheap to close: dispatch two `submitRecording(blob)` calls back-to-back inside `act` without awaiting between, assert `uploadMock` and `invokeMock` each fired exactly once.
2. **The pronunciation-session E2E spec is `in-progress`, not `complete`.** Request 4.5's last AC explicitly says the spec "lands at `complete` (CI flag)". The manifest entry for `pronunciation-session` is `in-progress`, the spec body has a comment block explaining what's missing (fake-media-stream launch flags, a real Stop click, an assertion on the `97` score), and CI's "Determine complete E2E flows" step skips the test. Net: the AC is unmet, the user-visible flow has no end-to-end coverage, and the regression net for the route + page wiring is the unit test only. The spec author explicitly chose `in-progress` (`chore(4.5): manifest pronunciation-session → in-progress` is a real commit), so this is acknowledged technical debt — but it should be tracked as a fix-request, not absorbed silently.
3. **`CardPronunciationHistory.test.tsx` lacks a "Load more" pagination assertion.** The Phase-3 sibling (`CardComprehensionHistory.test.tsx`) asserts `Load more` is shown at `data.length === pageSize` and hidden below — that assertion didn't carry forward. The component code does the right thing (line 129–133), but the contract isn't pinned.

## Per-area grades

| Area                                                         | Grade | Notes                                                                                                                                                                           |
| ------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web.ts` mic adapter (4.1)                                   | A     | 9 cases mapped to ACs (canRecord true/false, permission states ×2, startRecording, stopRecording-blob, cancelRecording-stops-stream). No cancelRecording-after-stop test, but `web.ts:184-198` is idempotent by design (state guard + try/catch). |
| `MicCapture.tsx` (4.2)                                       | A-    | 7 cases: idle/unsupported/recording/onRecorded/denied/playback/re-record. NotAllowedError-as-denied is asserted. **Gap:** unmount-during-`requesting` (post-getUserMedia, pre-handle) is untested. See BugHunt W-3.                              |
| `storage.ts` (4.3 helper)                                    | A     | 5 cases — happy path, mp4-on-iOS, .bin fallback, 10MB cap, supabase-error-propagation.                                                                                          |
| `bucket-rls.test.ts` (4.3 integration)                       | A     | 5 assertions: bucket-exists+private, upload-own-ok, upload-cross-prefix-blocked, list-cross-prefix-blocked, download-cross-prefix-blocked. The download-block assertion is the strongest of the suite. |
| `handler.ts` Edge Function (4.4)                             | A     | 9 Deno cases, every error code path covered including OPTIONS preflight + AbortError → UPSTREAM_TIMEOUT mapping. The structured-log assertion is rare in the codebase and welcome. |
| `usePronunciationSession.test.ts` (4.5)                       | B+    | 7 cases. **Gap:** no re-entrancy test (T-1 below). Compensating: the hook has the guard already, just isn't pinned by a test.                                                  |
| `PronunciationSessionPage.test.tsx` (4.5)                    | B     | 8 cases — loading, content, deck-not-found, empty-deck, completion-summary, record→submit, result-panel, Next. **Gap:** result-panel asserts `feedback-panel` testid presence, not the actual rendered canned text — same pattern as Phase-3 T-1, but here a pseudo-mock of FeedbackPanel makes that intentional. Note: `result.transcript || '(silent)'` empty-transcript branch is unasserted. |
| `CardPronunciationHistory.test.tsx` (4.5)                    | B     | 5 cases. **Gap:** `Load more` shown/hidden boundary untested (carry-forward from Phase-3's `CardComprehensionHistory` pattern); audio-storage-path-NULLed-row "no Play button" branch is asserted (one of the rows is null), so retention privacy property is verified at the UI seam. |
| `DeckListItem.test.tsx` extension (4.5)                      | A     | 7 cases — deck name, count, level, source tag, three action links (Review, Comprehension, Pronunciation) each with `aria-label` and `href` asserted.                            |
| `audio-retention.test.ts` (4.6 integration)                  | A     | 2 cases: free-reaped + pro-preserved + path-NULLed (under one test); idempotency under the second. The DEBT-005 caveat ("file blob stays") is explicit in the test comments — auditors won't be misled. |
| `pronunciation-session.spec.ts` (4.5 E2E)                    | C     | The spec body covers the route mount + Record button visibility, but **does not** drive Stop click or assert on the score panel — explicitly per the manifest's `in-progress` flag. AC 4.5#8 is unmet. See T-2.                                  |
| Routing (`apps/web/src/routes/index.tsx`)                    | A     | Pronunciation route is registered (line 33) at the correct position before the `*` catch-all. Route table is still untested directly, but the unit test for the page is rendered through `MemoryRouter` matching the actual path.              |
| Edge Errors enum (Node + Deno mirror)                        | A     | Both copies exist; both are typed as `as const` literals; the HTTP-status table is identical. Drift-audit watches them.                                                          |

## Specific findings

### T-1 (Warning) — `usePronunciationSession` has no re-entrancy guard test, despite the guard being implemented

**File:** `apps/web/src/features/pronunciation/usePronunciationSession.test.ts` (no relevant test); guard implementation at `apps/web/src/features/pronunciation/usePronunciationSession.ts:90, 111-115, 142`.

The `submittingRef` is in place — that's good — but the contract isn't pinned by a test. A future refactor that drops the guard (e.g. swapping to React 19 `useTransition`, removing the ref as "redundant") would not be caught. The Phase-3 fix-request (`fix-bug-comprehension-reentrancy-guard.md`) added the test alongside the implementation; the same test pattern should land here.

**Proposed test:**
```ts
it('rejects a second concurrent submitRecording (re-entrancy guard)', async () => {
  setupSupabase();
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
    await b.catch(() => undefined); // either resolves with the cached pending result or rejects
  });

  expect(uploadMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(result.current.pendingResult).not.toBeNull();
  expect(firstResolved).toBeDefined();
});
```

### T-2 (Warning) — Pronunciation-session E2E is `in-progress`; AC 4.5#8 is not satisfied

**File:** `apps/web/tests/e2e/pronunciation-session.spec.ts:73-78` (comment explicitly notes the spec is incomplete); `e2e-manifest.json:21` (`status: "in-progress"`).

Request 4.5's acceptance criterion #8 reads: "`pronunciation-session` E2E spec lands at `complete` (CI flag) — `apps/web/tests/e2e/pronunciation-session.spec.ts`". Today the spec asserts that the route mounts and the Record button is visible — the actual record→stop→score round-trip is not driven, so the page-level integration with `MicCapture`, `usePronunciationSession`, the (mocked) Storage upload, the (mocked) Edge Function, and the result-panel render is exercised at the unit-test level only. The spec author left a 6-line comment in-line listing what's needed: `--use-fake-device-for-media-stream` launch flags, recording-state wait, Stop click, score assertion.

This is acknowledged technical debt (the `chore(4.5)` commit deliberately flipped to `in-progress`) but the AC is binary: ship the spec at `complete` or it's unmet. Two paths forward:

- **Path A (preferred):** add the `launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }` block to `playwright.config.ts`, finish the missing assertions, flip the manifest. Estimated effort: <1h.
- **Path B (deferred):** log as DEBT-006 in `audits/debt.md` with a concrete activation plan, and add a one-line note to `requests/phase-4-pronunciation/4.5-pronunciation-session-ui.md` noting the AC is met-modulo-DEBT.

### T-3 (Info) — `CardPronunciationHistory.test.tsx` doesn't pin the `Load more` boundary

**File:** `apps/web/src/features/pronunciation/CardPronunciationHistory.test.tsx`.

`CardComprehensionHistory.test.tsx` has tests asserting `Load more` is rendered when `data.length === pageSize` and not rendered when `data.length < pageSize`. The pronunciation sibling skipped this. Since the component bodies are nearly identical (copy-paste of the comprehension component plus the play-blob path), the same test pattern should mirror over.

**Proposed test:**
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
```

### T-4 (Info) — `MicCapture.tsx`'s "error" status branch is asserted only via the NotAllowedError detour

**File:** `apps/web/src/features/pronunciation/MicCapture.tsx:60-62, 125-134` (the `error` branch); `MicCapture.test.tsx`.

The component has a clean `error` Status with its own UI branch. The only test that exercises it is the NotAllowedError test (which actually routes to `denied` because of the `/NotAllowedError|denied/i` regex). A test with a non-permission error message (e.g. "device busy", "no microphone") would pin the branch. Low-priority — the branch is small and the regex is narrow enough that misclassification is unlikely.

### T-5 (Info) — `web.test.ts` does not assert that `cancelRecording` after a successful `stopRecording` is idempotent

**File:** `apps/web/src/platform/web.ts:182-198` (the `if (state !== 'inactive')` guard); `apps/web/src/platform/web.test.ts:251-257`.

The implementation is defensive (state guard + try/catch on every `track.stop()` and `recorder.stop()`). The MicCapture cleanup effect *will* call `cancelRecording` on a handle whose recorder is already inactive (after a successful Stop). The single test today calls `cancelRecording` against a fresh handle. Worth one `it('is idempotent after stopRecording', ...)` to nail the contract — the cleanup-on-handle-change pattern in `MicCapture.tsx:33-37` depends on it.

### T-6 (Info) — Edge Function tests do not assert the `expected` field returns the card's `target_text` verbatim (no normalization round-trip)

**File:** `supabase/functions/score-pronunciation/handler.test.ts:171-194` (happy-path test).

The happy-path test asserts `body.data.expected === 'hola'` (the original `target_text`). That's correct behavior — `expected` is documented as `target_text echoed for client convenience` (api-contracts.md). The test passes, the contract is honored. Not a gap; noting only because a future change that "helpfully" pre-normalizes `expected` to match how similarity sees it would be a contract break, and the assertion would catch it. Keeping it.

### T-7 (Info) — No test for `playRecordedAudio` when the underlying `<audio>.play()` rejects

**File:** `apps/web/src/platform/web.ts:201-222`. `audio.play()` returns a Promise that can reject (e.g. iOS Safari outside a user gesture). The current `void audio.play()` swallows that rejection silently — the outer `Promise<void>` will only resolve via `ended` or reject via `error`. If `play()` rejects but no `error` event fires, the outer promise hangs forever. This is a bughunt finding (W-2) more than a test gap, but worth noting that no test covers it.

## Top three improvements (ranked by impact)

1. **Add the re-entrancy test to `usePronunciationSession.test.ts`.** Pins the existing guard against future regression. Mirrors the Phase-3 fix's test exactly.
2. **Finish the pronunciation-session E2E and flip the manifest, OR log DEBT-006.** The AC is binary; the call is "do it or document why not". Recommend doing it — the missing piece is ~10 lines plus a launch-flags config.
3. **Mirror `Load more` test from `CardComprehensionHistory` to `CardPronunciationHistory`.** Cheap copy-paste, closes a contract gap.

## Blocking findings

**None on critical-path code.** No D or F grades on auth/RLS/Edge Functions/FSRS/payments. The lowest grade in the matrix is C (E2E spec) — non-blocking. Per the skill rule, Phase 4 is **mergeable** by TestAudit's gate.

The combined T-1 + T-2 represent meaningful test debt that would be cheap to close before Phase 5 begins, since Phase 5's `generate-feedback` Edge Function will copy the score-pronunciation handler-factory pattern and the Phase-5 UI will compose with `MicCapture`'s recording handle.

## Fix-request files generated

- `requests/phase-4-fixes/fix-test-pron-session-reentrancy-guard.md` (T-1)
- `requests/phase-4-fixes/fix-test-pronunciation-e2e-complete.md` (T-2)
- `requests/phase-4-fixes/fix-test-card-pronunciation-history-loadmore.md` (T-3)

T-4 / T-5 / T-6 / T-7 are Info-tier; report-only per the skill spec.
