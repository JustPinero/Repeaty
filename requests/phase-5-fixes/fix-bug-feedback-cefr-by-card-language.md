# Fix — `generate-feedback` uses the user's first user_languages row as CEFR for every card

**Severity:** Medium. Bughunt Phase-5 Medium-2.

## Root cause

`supabase/functions/generate-feedback/index.ts:50-66` (`getProfile` impl) reads `user_languages.cefr_level` with `.eq('user_id', userId).limit(1)` — no filter on `language_code`. A user studying ES at A1 and FR at B2 gets all feedback generated against A1, regardless of the card's language. The handler factory's `getProfile(userId)` dep doesn't take a card-language parameter, so the bug is in the production wiring, not the contract.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | The CEFR level passed to the prompt builder reflects `user_languages.cefr_level` for the **card's** `language_code`, not the user's first row. |
| 2 | When the user has no row for the card's language (edge case — card is in a deck for a language the user no longer studies), fall back to `A1`. |
| 3 | A handler-test verifies the new dep signature is plumbed through. |
| 4 | The integration test (see `fix-test-edge-fn-integration-suites.md`) seeds a user with two languages at different CEFRs and asserts the prompt includes the right CEFR for the card. |

## Suggested patch

Reshape the dep contract so the CEFR lookup happens **after** the attempt loads (since the attempt carries `card_language_code`):

```ts
// Before
getProfile(userId): Promise<Profile>;
// After
getProfile(userId): Promise<Pick<Profile, 'tier' | 'native_language_code'>>;
getCefrForLanguage(userId, langCode): Promise<CefrLevel>;
```

The handler then calls `getCefrForLanguage(user.id, attempt.card_language_code)` once the attempt is loaded.

## Files to touch

- `supabase/functions/generate-feedback/handler.ts`
- `supabase/functions/generate-feedback/index.ts`
- `supabase/functions/generate-feedback/handler.test.ts`
- `apps/web/tests/integration/supabase/generate-feedback.test.ts` (the missing one — see `fix-test-edge-fn-integration-suites.md`)

## Out of scope

Same fix in `generate-lesson` is already correct — the request body carries `language_code` and the wiring queries `user_languages` filtered by it.
