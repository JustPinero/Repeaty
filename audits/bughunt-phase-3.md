# BugHunt — Phase 3 (Comprehension Mode)

Mode: quick. Scope: files modified between `main` and `phase-3-comprehension` HEAD.

## Summary
- **Critical:** 1
- **Warning:** 4
- **Info:** 3

The phase ships clean on the security/RLS axis. The new `comprehension_attempts` insert path uses the user-scoped supabase-js client; RLS policies (`comp_select_own`, `comp_insert_own`, `comp_update_own`, `comp_delete_own`) are in place from Phase 1's migration 0006 and verified by the new integration suite. WITH-CHECK on insert prevents user-A from spoofing user-B's id, and cross-user reads return 0 rows. No service-role key reaches the browser; the canned-text feedback path is synchronous and pure (no LLM call, no rate-limit surface).

The Critical finding is a routing-table omission: the `CardDetail` page is implemented and linked from the comprehension result UI, but its route (`/app/decks/:deckId/cards/:cardId`) is **not registered** in `apps/web/src/routes/index.tsx`. The "View card history" link from a comprehension result navigates to a path that the catch-all `'*' → Navigate to /app` rule swallows — silently redirecting to the dashboard with no signal that anything went wrong. This blocks Request 3.4's user-facing acceptance criterion ("Card detail route mounts the history panel") and renders Phase 3's history view dead from a user's perspective, even though the implementation is otherwise correct.

The four Warnings are: (1) the comprehension session hook lacks the re-entrancy guard that Phase-2 W-2 fixed in `useReviewSession` (and which the review-session fix's own comment explicitly warned would be needed for comprehension); (2) `total === 0` (an empty deck) leaves `isComplete = false` and renders the input form with `currentCard = null`, presenting a broken UX rather than the "Nothing due — try again later" empty-state the request file specified; (3) the `useFeedback` hook violates React Hook naming conventions by being a pure function that doesn't actually use any hook — it'll trip lint or break when Phase 5 wires in the async TanStack Query call; (4) the v1 `NATIVE_LANG_PLACEHOLDER = 'en'` constant in ComprehensionSessionPage hardcodes English-as-native for all users — pre-flagged in the brief as Phase-5's swap-in territory, and intentional for v1, but worth a Warning so it doesn't get forgotten.

## Critical

### C-1 — `/app/decks/:deckId/cards/:cardId` route is unregistered; CardDetail page is unreachable
**File:** `apps/web/src/routes/index.tsx` — only `decks`, `decks/:deckId/review`, `decks/:deckId/comprehension`, and `*` are registered under `/app`. There is **no** entry for `cards/:cardId`.

Cross-references:
- `apps/web/src/pages/CardDetail.tsx` exists and is fully implemented.
- `apps/web/src/features/comprehension/ComprehensionSessionPage.tsx:135-141` renders `<Link to={`/app/decks/${deckId}/cards/${session.currentCard.id}`}>` from the per-card result UI.
- Request 3.4's acceptance criterion: "Card detail route `/app/decks/:deckId/cards/:cardId` mounts the history panel".

When a user clicks "View card history" from a comprehension result, react-router's catch-all `path: '*'` (line 31) matches, and the `<Navigate to="/app" replace />` element fires — silently redirecting to the dashboard. There is no 404 surface, no error toast, no broken-link warning. The user is unable to access the per-card history view at all.

**Reproduction:** start a comprehension session, submit any answer, click "View card history" on the result. Observe redirect to `/app`.

**Why Critical:**
- Blocks a user-facing AC of Request 3.4. The per-card history view is a primary deliverable of the phase.
- The defect is silent — neither tests nor user-facing UI surface it. The sole reason it didn't break the page-level tests is that the link isn't asserted as resolving.
- Easy to miss because the page file exists and the integration test (RLS) passes — the seam is in the routing table only.

**Fix:** Add a route under the `/app` parent in `apps/web/src/routes/index.tsx`:

```tsx
import CardDetailPage from '@/pages/CardDetail';
// ...
{ path: 'decks/:deckId/cards/:cardId', element: <CardDetailPage /> },
```

Place before the `'*'` catch-all (the array order in `createBrowserRouter`'s children matters: catch-alls last). Pair with the smoke test from `requests/phase-3-fixes/fix-test-card-detail-smoke.md` (TestAudit T-2).

## Warning

### W-1 — `useComprehensionSession.submitResponse` has no re-entrancy guard
**File:** `apps/web/src/features/comprehension/useComprehensionSession.ts:102-150`

`submitResponse` reads `currentCard` from the closure, awaits `supabase.from('comprehension_attempts').insert(...)`, and calls `setPendingResult`. If two responses are submitted in flight (user double-tapping Enter, or future auto-submit-on-timeout), both invocations capture the same `currentCard`, both fire an insert (creating two attempt rows for one card), and `setPendingResult` is called twice. The page wraps with a `submitting` boolean (`ComprehensionSessionPage.tsx:26-46`), but the hook contract is exposed without internal guard.

This is structurally identical to Phase-2 W-2 on `useReviewSession`, fixed in chore(3.0) by adding a `submittingRef`. The fix's own comment block (`useReviewSession.ts:110-113`) explicitly mentions comprehension as the next caller that needs the same pattern: "for any future caller (offline replay loop in Phase 6, auto-rate-on-timeout for comprehension mode, etc.)". The new hook didn't carry the pattern forward.

**Reproduction:** call `submitResponse('hello')` twice in `act` without awaiting between. Observe two `comprehension_attempts.insert` calls instead of one.

**Fix:** mirror the `submittingRef` pattern from `useReviewSession.ts:114-159`. Test pattern in `requests/phase-3-fixes/fix-test-comprehension-reentrancy-guard.md`.

### W-2 — Empty deck (`total === 0`) renders a broken card prompt, not an empty-state
**File:** `apps/web/src/features/comprehension/useComprehensionSession.ts:100`, `ComprehensionSessionPage.tsx:103-180`

```ts
const isComplete = !isLoading && !isError && hydrated && index >= total && total > 0;
```

The `&& total > 0` guard is correct — you don't want to flash "Session complete" for a user who never started. But the page has no branch for `total === 0`: when neither `isLoading`, `isError`, nor `isComplete` is true, the page falls through to the prompt-input render (line 103) with `session.currentCard?.target_text` rendering as empty string. The user sees a card with an empty headline, an input, and a Submit button — clicking Submit calls `submitResponse('')` (which `handleSubmit` blocks via `!response.trim()`); typing and clicking Submit calls `submitResponse(...)` which throws "no current card" inside the hook.

Request 3.2's AC: "Empty queue → 'Nothing due — try again later.' (consistent with review session)" is unmet.

**Reproduction:** point a user at a deck whose `cards.length === 0` (or where every card was somehow filtered out). Page renders broken UX with empty prompt and unsubmittable form.

**Note:** the bundled decks all have ≥30 cards; this is an edge case that bites in two future scenarios — (a) Phase 5 AI-generated decks with `card_count: 5` minimum where a generation failure could yield 0 cards, (b) imported decks that user emptied. Worth fixing now so the contract matches review.

**Fix:** add an empty-queue branch in the page after the `isComplete` check:

```tsx
if (session.progress.total === 0) {
  return (
    <main /* ... */>
      <p>Nothing in this deck yet — try again later, or pick another deck.</p>
      <Link to="/app/decks">Back to your decks</Link>
    </main>
  );
}
```

### W-3 — `useFeedback` is named like a hook but is a pure function
**File:** `apps/web/src/features/feedback/useFeedback.ts:27-31`

```ts
export function useFeedback(input: FeedbackInput): FeedbackResult {
  const prefix = (input.nativeLanguageCode || '').toLowerCase().split('-')[0] ?? 'en';
  const text = lookupFeedback({ bucket: input.bucket, nativeLangPrefix: prefix });
  return { text, isLoading: false };
}
```

The body uses no React hooks (no `useState`, `useMemo`, `useEffect`, `useQuery`). The `use` prefix tells `react-hooks/rules-of-hooks` and Phase-5 maintainers that this is hook-shaped, but today it's just a function. Two consequences:

1. **Phase 5 swap risk.** The 3.5 spec promises Phase 5 will "rewire to call the `generate-feedback` Edge Function — the public API stays stable". If Phase-5 swaps the body to use `useQuery`, today's pure-function callers will crash if any of them happen to call `useFeedback` outside of a component (e.g. a non-React unit test, a memoization helper). No callers do this today, but the v1 → v2 swap is exactly the kind of silent breakage the lint rule is designed to catch.
2. **Lint inconsistency.** `react-hooks/rules-of-hooks` doesn't fire on a hook-named function with no hook calls (it can't know it's "supposed" to be a hook). But the next time the function gains a single `useMemo`, lint suddenly cares about every conditional caller. A future `if (someCondition) useFeedback(...)` that's safe today becomes a lint error post-Phase-5 swap.

**Mitigation options:**
- Cleanest: rename to `getFeedback` (or `pickFeedback`) for v1; rename to `useFeedback` when Phase 5 makes it actually hook-shaped. The 3.5 spec's "API stays stable" promise is honored via a re-export wrapper.
- Quick: add a `useState`/`useMemo` no-op to bring it inside hook semantics today. Trivial: `const text = useMemo(() => lookupFeedback(...), [input.bucket, prefix])`. Zero-cost, satisfies the lint rule, and Phase-5's swap is then a real-hook-to-real-hook change.

The second option is what the comments in `useFeedback.ts` imply ("Phase 5 will replace the body with a TanStack-Query-backed call") — the intent is hook-shaped from day one. Recommend taking it.

### W-4 — `NATIVE_LANG_PLACEHOLDER = 'en'` hardcodes English for FeedbackPanel
**File:** `apps/web/src/features/comprehension/ComprehensionSessionPage.tsx:14`

```ts
const NATIVE_LANG_PLACEHOLDER = 'en';
// ...
<FeedbackPanel ... nativeLanguageCode={NATIVE_LANG_PLACEHOLDER} />
```

For v1, all users get English-prefix canned text, regardless of their actual `profiles.native_language_code`. The `canned-text.ts` table has `es`, `pt`, `fr`, `de` strings already authored — the placeholder strands them. The brief flagged this as Phase-5 swap-in territory, but ranking it explicitly as a Warning prevents it from being forgotten:

- Phase-5 wires the real `profiles.native_language_code` lookup (per the brief).
- Until then, a Spanish-as-native user studying English sees English coaching text — minor UX cost but real.
- The constant is named `*_PLACEHOLDER` and commented, so the temporary nature is visible. That's good. The Warning is essentially "make sure Phase 5 actually rips this out".

**Fix:** tracked for Phase 5. No change required in Phase 3. The Warning exists so it surfaces in the next phase audit if missed.

## Info

### I-1 — `useFeedback`'s `?? 'en'` fallback is dead code
**File:** `apps/web/src/features/feedback/useFeedback.ts:28`

```ts
const prefix = (input.nativeLanguageCode || '').toLowerCase().split('-')[0] ?? 'en';
```

`''.split('-')` returns `['']` (length 1, never empty). So `[0]` is always `''` (not `undefined`), and the `?? 'en'` never fires. The intent is "fall back to en when input is empty"; today the empty string flows through to `lookupFeedback` which then falls back via `FEEDBACK[''] ?? FEEDBACK['en']`. Same outcome via different mechanism. Cosmetic.

### I-2 — Page-level `cardStartedAt` and hook-level `cardStartedAt.current` are independently maintained
**File:** `ComprehensionSessionPage.tsx:27, 31-35`, `useComprehensionSession.ts:85-95, 152-158`

Two timers, two `Date.now()` calls. Page state drives the visible Timer; hook ref drives the recorded `responseMs`. They differ by a few ms because the page's `useEffect` runs after render. Not a bug — the canonical timing (hook) is what gets persisted, and the visible drift is sub-perceptual. Worth a comment noting which one is authoritative, or refactor so the hook exposes its `cardStartedAt` for the Timer to read.

### I-3 — `Timer.test.tsx` has time-dependent assertions
**File:** `apps/web/src/features/comprehension/Timer.test.tsx:9, 14`

Regex assertions `/^0\.[01]s$/` and `/^3\.[4-6]s$/` permit small jitter. On a heavily loaded CI runner the gap between `Date.now()` in the test and `Date.now()` in the component's `useState` initializer can exceed 100ms, flaking the first assertion. Mitigate via `vi.useFakeTimers({ now: <fixed-epoch> })` if it ever flakes. Today: no observed flakes.

## Reproduction-friendly summary

| Finding | Repro                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------- |
| C-1     | Submit a comprehension response, click "View card history" — silently redirects to /app             |
| W-1     | `submitResponse('x')` × 2 in `act` without `await` between — two `comprehension_attempts` inserts   |
| W-2     | Mock `cardsResult.mockResolvedValue({ data: [], error: null })` — page renders empty prompt + form  |
| W-3     | Phase-5 swap: change body to use `useQuery` — any non-component caller crashes                      |
| W-4     | Spanish-as-native user studying English: sees English coaching text                                 |

## Fix-request files generated

- `requests/phase-3-fixes/fix-bug-card-detail-route-missing.md` (C-1)
- `requests/phase-3-fixes/fix-bug-comprehension-reentrancy-guard.md` (W-1; pairs with TestAudit T-3)
- `requests/phase-3-fixes/fix-bug-empty-deck-empty-state.md` (W-2)
- `requests/phase-3-fixes/fix-bug-feedback-hook-shape.md` (W-3)

W-4 is intentionally not a fix-request — Phase 5 absorbs it per the brief.

## Blocking

**C-1 blocks Phase 4 merge** per the skill's blocking rule ("Any Critical finding blocks the next phase"). The fix is one route entry; Phase 4 should not begin until C-1 lands.
