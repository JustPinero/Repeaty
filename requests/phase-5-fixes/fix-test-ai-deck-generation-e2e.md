# Fix — `ai-deck-generation-pro` E2E spec missing; manifest still `not-started`

**Severity:** High. Test-audit Phase-5 High-2.

## Root cause

Request 5.6 acceptance criterion: "`generate-lesson-flow` E2E spec at `complete` (CI flag)". Two gaps:

1. The spec file `apps/web/tests/e2e/ai-deck-generation-pro.spec.ts` does not exist.
2. `e2e-manifest.json.flows.ai-deck-generation-pro.status` is `"not-started"`.

This is an unmet acceptance criterion of the phase. The Phase-5 audit gate cannot be cleanly closed without it.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | A Playwright spec at `apps/web/tests/e2e/ai-deck-generation-pro.spec.ts` covers: signup → onboarding (with Pro tier flipped via test-only seed) → dashboard → click "Generate a lesson" CTA → fill the form → submit → see the spinner → land on `/app/decks/<deck_id>/review`. |
| 2 | The Edge Function call is mocked via `page.route(/\/functions\/v1\/generate-lesson$/, ...)` returning a 200 with a synthetic `{ deck_id, deck_name, card_count: 8 }` body. |
| 3 | The deck-list / deck-detail mock for the post-redirect view returns enough data for the review session to render its first card. |
| 4 | The spec mirrors the `pronunciation-session.spec.ts` pattern — same mocking approach, same selector style (role-based queries). |
| 5 | `e2e-manifest.json.flows.ai-deck-generation-pro.status` is flipped to `"complete"`. |
| 6 | The CI run for the resulting commit includes the spec in the green run. |

## Files to touch

- `apps/web/tests/e2e/ai-deck-generation-pro.spec.ts` (NEW)
- `e2e-manifest.json` — flip status.
- (potentially) `apps/web/tests/e2e/_helpers.ts` if a Pro-tier seed helper is appropriate.

## Out of scope

A non-mocked end-to-end (real Anthropic + real DB) — that's a Phase 6 staging-env smoke, not a per-PR E2E.
