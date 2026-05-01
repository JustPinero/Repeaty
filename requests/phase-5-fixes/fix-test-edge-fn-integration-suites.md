# Fix — Missing live-Supabase integration tests for `generate-feedback` and `generate-lesson`

**Severity:** High. Test-audit Phase-5 High-1.

## Root cause

Request 5.3 lists `apps/web/tests/integration/supabase/generate-feedback.test.ts` under files-to-touch (line 41 of `requests/phase-5-ai-personalization/5.3-generate-feedback-edge-fn.md`). Request 5.5 lists `apps/web/tests/integration/supabase/generate-lesson.test.ts` (line 42 of 5.5). Neither file exists in the diff. The handler-factory unit tests cover most behavior but several criteria require live Postgres + a real RPC round-trip:

- "Persists feedback_cache row + updates source attempt's `feedback_text`" (5.3 acceptance criterion)
- "Inserts deck row + cards atomically (single transaction)" (5.5 acceptance criterion)
- The actual `bump_rate_limit` round-trip in production wiring (which is currently broken — bughunt Critical-1).

A live integration test would have surfaced the auth-context bug before merge.

## Acceptance criteria

### `generate-feedback.test.ts`

| # | Criterion |
| - | --------- |
| 1 | Seeds a Pro user, a card, and a non-perfect `pronunciation_attempts` (or `comprehension_attempts`) row. |
| 2 | Mocks the Anthropic call via Deno serve flag (or via a deps-injected `callClaude` if Anthropic mocking is too heavy for live integration). |
| 3 | Asserts the function returns 200 with the right `feedback_text`. |
| 4 | Asserts a `feedback_cache` row was persisted with the expected `(card_id, error_pattern, native_language_code)`. |
| 5 | Asserts the source `pronunciation_attempts.feedback_text` was updated. |
| 6 | Asserts a second call for the same `(card_id, error_pattern, native_language_code)` returns `cached: true` and does NOT increment `rate_limits.feedback_generation`. |
| 7 | A free-tier user calling the function gets 403 `FORBIDDEN_TIER`. |
| 8 | After 25 successful cache-miss calls in a UTC day, the 26th returns 429 `RATE_LIMITED`. |

### `generate-lesson.test.ts`

| # | Criterion |
| - | --------- |
| 1 | Seeds a Pro user with a `user_languages` row at CEFR A1 for `es`. |
| 2 | Mocks the Anthropic call to return a valid 8-card deck JSON. |
| 3 | Asserts the function returns 200 with the new `deck_id`. |
| 4 | Asserts a `decks` row exists with `source = 'ai_generated'`, `owner_id = user.id`, `language_code = 'es'`. |
| 5 | Asserts 8 `cards` rows exist tied to that deck. |
| 6 | Asserts `rate_limits.lesson_generation.count = 1` for the user / today. |
| 7 | After 10 successful calls in a UTC day, the 11th returns 429 `RATE_LIMITED` (and the 11th does not insert a partial deck). |
| 8 | A free-tier user gets 403 `FORBIDDEN_TIER`. |
| 9 | Calling with a `language_code` not in the user's `user_languages` returns 400 `INVALID_PAYLOAD`. |

## Files to touch

- `apps/web/tests/integration/supabase/generate-feedback.test.ts` (NEW)
- `apps/web/tests/integration/supabase/generate-lesson.test.ts` (NEW)
- `apps/web/tests/integration/supabase/_helpers.ts` — add helpers for seeding Pro users, attempts, and `user_languages` if not present.

## Out of scope

Mocking the actual Anthropic API endpoint at the network level — for v1, dependency-injecting a fake `callClaude` is sufficient. Phase 6 can wire a sandbox.
