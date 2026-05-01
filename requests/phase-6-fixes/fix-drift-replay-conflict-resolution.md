# Fix — `useOfflineReplay` upserts unconditionally; doc previously promised stricter rule

**Severity:** Medium (drift-audit-phase-6 Med-1)
**Originating audit:** Phase 6 drift-audit

This finding has the same scope and same code-side fix as `fix-test-replay-conflict-resolution.md`. Tracked separately because the drift-audit angle is "doc and code disagreed" while the test-audit angle is "no test for the promised rule."

The drift-audit patched the doc to match shipped behavior in this audit pass (`references/repeaty-pwa.md` § Offline queue now describes the v1 client-wins-on-upsert behavior + flags this fix-request). The code-side activation can wait until before multi-user beta.

→ See `requests/phase-6-fixes/fix-test-replay-conflict-resolution.md` for the acceptance criteria + files to touch.
