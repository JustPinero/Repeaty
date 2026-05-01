# Fix — `bundled-decks.test.ts` doesn't assert ja/zh `ipa` is populated

**Severity:** Medium (test-audit-phase-6 Med-2)
**Originating audit:** Phase 6 test-audit
**Discovered:** 2026-04-30

## Root cause

Request 6.1: "Each card has target_text, native_text, and an optional ipa for ja/zh." The shipped `scripts/seed/decks/starter-{ja,zh}-a1.yaml` carry an `ipa` field on every card (kana romanization + pinyin with tone marks).

`apps/web/tests/integration/supabase/bundled-decks.test.ts` asserts target / native / language_code are non-empty for every bundled card but does not assert `cards.ipa IS NOT NULL` for ja and zh decks specifically. A regression where seed-decks.ts drops the `ipa` column or the YAML loses the field would not fail any test.

## Acceptance criteria

- [ ] New test case in `bundled-decks.test.ts`: for ja and zh decks, every card row has `ipa` populated (non-null, non-empty).
- [ ] Test fails on a synthetic regression (manually verify by temporarily NULL-ing the field on one row and confirming the test reports it).

## Files to touch

- `apps/web/tests/integration/supabase/bundled-decks.test.ts`
