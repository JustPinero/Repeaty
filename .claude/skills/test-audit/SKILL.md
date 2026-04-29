---
name: test-audit
description: Run after phase completion or on demand. Evaluates test coverage, strategy, and quality across the target scope.
---

# TestAudit

## When to invoke
- End of every phase (via `/run-audits` or `/phase-complete`).
- On demand for a specific file or area: `/test-audit path/to/file.ts`.

## Modes
- **Quick** (default) — scope to files touched in the target phase.
- **Deep** — scope to the entire codebase.

## Scoring (letter grade A–F)
- **A — Comprehensive.** Edge cases, failure paths, integration paths all tested. Tests are deterministic and fast.
- **B — Good.** Most happy + sad paths covered. Minor gaps. No critical blind spots.
- **C — Basic.** Happy paths only. Obvious gaps in error handling or edge cases.
- **D — Minimal.** Significant blind spots. Many code paths untested.
- **F — Missing or non-functional.** Tests don't exist, are skipped, or don't actually exercise the code under test.

## What to evaluate
1. **Coverage of acceptance criteria** — every criterion in each request file should map to a named test. Cross-reference `requests/phase-N-*/X.Y-*.md`.
2. **Failure paths** — are error branches, validation failures, network errors, and edge cases tested?
3. **Integration vs unit balance** — are critical seams (Supabase RLS, Edge Function contracts, FSRS scheduling) covered by integration tests, not just mocks?
4. **Test determinism** — flaky tests, time-dependent assertions without freezing, ordering assumptions.
5. **A11y test coverage** — components with interactive logic should have a test asserting keyboard reachability and aria associations.
6. **Anti-patterns** — `expect(true).toBe(true)`, tests that don't fail when the implementation is broken, snapshot tests without meaningful diffs.

## Output
1. Report → `audits/test-audit-phase-N.md` with:
   - Overall grade + per-area grades
   - Specific file:line citations for issues
   - Top three improvements ranked by impact
2. Fix requests → `requests/phase-N-fixes/fix-test-[short-desc].md` (one per material gap), each containing:
   - **What's missing** (the gap)
   - **Why it matters** (consequence if it stays missing)
   - **Proposed test** (sketch with assertions)
   - **Files to touch**
   - **Acceptance criteria** (specific, testable)

## Blocking rule
Grade D or F on critical-path code (auth, RLS, Edge Functions, FSRS, payment-related once Stripe lands) blocks the next phase.
