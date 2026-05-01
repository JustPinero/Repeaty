# Fix — Flip pronunciation-session E2E to `complete` (or log DEBT-006)

**Source audit:** TestAudit Phase 4 (T-2)
**Severity:** Warning — AC 4.5#8 is unmet

## What's missing

`requests/phase-4-pronunciation/4.5-pronunciation-session-ui.md` AC #8: "`pronunciation-session` E2E spec lands at `complete` (CI flag) — `apps/web/tests/e2e/pronunciation-session.spec.ts`".

Today:
- `e2e-manifest.json:21` shows `"status": "in-progress"` — CI's "Determine complete E2E flows" step skips this spec.
- `apps/web/tests/e2e/pronunciation-session.spec.ts:73-78` has an explicit comment block saying the spec is incomplete: missing fake-media-stream launch flags, recording-state wait, Stop click, score assertion.
- A real `chore(4.5): manifest pronunciation-session → in-progress` commit acknowledges the deferral.

## Why it matters

The pronunciation flow has zero end-to-end coverage. The route mount, the page composition with `MicCapture` + `usePronunciationSession`, the (mocked) Storage upload + Edge Function round-trip, and the result-panel render are exercised at the unit-test level only. A regression that, e.g., breaks the `MicCapture → onRecorded → submitRecording → setPendingResult → render` chain at integration boundaries (TanStack Query cache, react-router param parsing, lazy boundaries) wouldn't be caught until manual testing on the beta device.

This is the first phase whose primary feature E2E doesn't run in CI. Phase 5 will compound the gap (AI-deck-generation requires the same setup).

## Proposed fix — Path A (preferred)

1. Add Playwright launch flags to `apps/web/playwright.config.ts`:
   ```ts
   use: {
     // ...
     launchOptions: {
       args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
     },
   },
   ```
2. Finish the spec body — uncomment the planned Stop click and the `/97/100/` assertion. The mocks for Storage + Edge Function are already in place.
3. Flip `e2e-manifest.json:21` to `"status": "complete"`.
4. Validate: run `pnpm --filter @repeaty/web test:e2e --grep pronunciation-session` locally, verify pass.

## Proposed fix — Path B (deferred)

1. Add **DEBT-006** to `audits/debt.md` with title "Pronunciation E2E spec — fake-media-stream launch flags". Activation plan: the four steps from Path A.
2. Add a one-line note to `requests/phase-4-pronunciation/4.5-pronunciation-session-ui.md` AC #8 that the AC is met-modulo-DEBT-006.
3. Leave the spec at `in-progress`.

Recommend Path A — the work is <1h and closes a real coverage gap.

## Files to touch (Path A)

- `apps/web/playwright.config.ts` — add `launchOptions.args`.
- `apps/web/tests/e2e/pronunciation-session.spec.ts` — finish the Stop click + assertion.
- `e2e-manifest.json` — flip `pronunciation-session.status` to `complete`.

## Acceptance criteria

- [ ] `pronunciation-session` runs in CI's "Run E2E for completed flows" step.
- [ ] The spec asserts the score panel renders with `97` (or whatever the mocked score is).
- [ ] The spec runs green in CI on the next push.
- [ ] If Path B is taken instead: DEBT-006 lands with a concrete activation plan and the request file is annotated.
