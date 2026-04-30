# BugHunt — Phase 2 (Flashcards & SRS)

Mode: quick. Scope: files modified between `main` and `phase-2-flashcards` HEAD.

## Summary
- **Critical:** 0
- **Warning:** 4
- **Info:** 3

The phase ships clean on the security/RLS axis. RLS for `decks` and `cards` is in place from Phase 1 and the bundled-decks integration test confirms an authenticated user can read both starter decks. The `reviews` upsert path uses the user-scoped supabase-js client (not service role); RLS enforces `auth.uid() = user_id` server-side. Server keys are not exposed in client code; FSRS state is opaque JSONB without secret content.

The four Warning findings are: (1) non-deterministic top-deck pick in `useDueCards` (already called out in the task brief — flagged here as user-experience drift), (2) the in-memory queue's `Again` re-enqueue races against the `setQueue` updater closure if `submitRating` is called concurrently at the hook level, (3) `useReviewSession` ignores the deck slug to determine `language_code` for the upsert (no user-facing bug today, but the hook dispatches via `card.language_code` denormalization without verifying the card belongs to the requested deck), (4) `Flashcard.handlePlay`'s try-catch swallows all speech errors silently — including platform misuse like wrong-lang BCP-47 codes — which makes JA/ZH degraded UX (DEBT-003) hard to detect in the wild.

## Critical
None.

## Warning

### W-1 — `useDueCards` top-deck pick is non-deterministic for ties (existing, also flagged in task brief)
**File:** `apps/web/src/features/dashboard/useDueCards.ts:96-113`

`for (const [deckId, counts] of perDeck.entries())` iterates a Map in insertion order. The Map is populated by iterating `cards` (line 85), and `cards` are loaded with `from('cards').select('id, deck_id').in('deck_id', decks.map(d => d.id))` — no ORDER BY. Postgres is free to return cards in any order; for a brand-new user where ES (1 due, 2 new = 3) and FR (0 due, 2 new = 2) tie at total cards-encountered, the first card-row encountered determines insertion order, which determines tiebreak.

Even where scores differ, the comparison at line 100 is `score > topScore` (strict greater), so the first deck inserted wins all ties. Insertion order = card-row arrival order = unspecified by Postgres without `ORDER BY`.

**Reproduction:** sign up a fresh user; observe that the dashboard's "Start review — X" CTA may point to ES or FR across reloads with no behavioral change. The E2E test had to relax its assertion to `/start review/i` (any) for this reason.

**Fix:** sort `decks.map(d => d.id)` before the `.in()` call, OR sort the `cards` query result with `.order('deck_id').order('id')` to force stable insertion, AND tiebreak on `(deck.name ASC)` in the top-deck selection. The task brief notes this is "worth flagging in BugHunt as a Warning if you think it should be deterministic" — yes, deterministic CTAs are worth a UX warranty.

### W-2 — `useReviewSession.submitRating` races against itself when called concurrently
**File:** `apps/web/src/features/review/useReviewSession.ts:95-126`

`submitRating` reads `queue[0]` (`head`) from the closure at the moment the function is invoked, then awaits the supabase upsert, then calls `setQueue((prev) => ...)`. If two ratings are submitted in flight (e.g. user clicks Good, then taps the keyboard `3` before the first await resolves), both invocations capture the same `head`, the upsert runs twice for the same card with race-conditioned final-state semantics (the second `schedule(...)` call uses the same input state but a slightly later `now`), and one of the two `setReviewedCount((c) => c + 1)` updaters double-counts the same card.

The page mitigates this with a `submitting` boolean (`ReviewSessionPage.tsx:11-21`), but the hook's contract does not enforce it. Any future caller that forgets the wrapper (or any test that probes concurrent submits) hits the race. The hook should either (a) take a mutation lock internally, or (b) use a `useRef` to capture an in-flight token.

**Reproduction:** call `submitRating(Good)` twice in `act` without awaiting between, and observe two upserts for `c1` instead of one for `c1` then one for `c2`.

**Fix:** internal guard:
```ts
const submittingRef = useRef(false);
const submitRating = useCallback(async (rating: Rating) => {
  if (submittingRef.current) return;
  submittingRef.current = true;
  try { /* existing logic */ }
  finally { submittingRef.current = false; }
}, [userId, queue]);
```

### W-3 — `useReviewSession` does not assert that returned cards belong to the requested deck
**File:** `apps/web/src/features/review/useReviewSession.ts:51-58`

`from('cards').select(...).eq('deck_id', deckId)` is RLS-scoped — but the RLS policy for `cards` is "visible iff deck is visible" (`cards_select_via_deck`). Combined with `decks_select_visible` (bundled OR owner_id = auth.uid()), this is correct: an attacker passing someone else's `deckId` gets 0 rows. But the query has no defensive ORDER BY on a stable column, and trusts that the deck exists (no 404 path). If a user navigates to `/app/decks/<arbitrary-uuid>/review` directly:

- The cards query returns `[]` (RLS denies).
- The hook hydrates with `items=[]`, `total=0`, immediately `isComplete=true`.
- `ReviewSessionPage` renders the "Nothing due — try again later" empty-state, which is misleading.

The user has no signal that the deck doesn't exist or isn't visible to them. This isn't a security issue (RLS works), but it's a wrong-error-class UX issue that masks 404s as empty queues.

**Reproduction:** navigate to `/app/decks/00000000-0000-0000-0000-000000000000/review`; see "Nothing due" rather than "Deck not found".

**Fix:** the hook (or the page) should fetch the deck row alongside the cards and surface a 404-style error when the deck is not visible.

### W-4 — `Flashcard.handlePlay` swallows all speech errors silently
**File:** `apps/web/src/features/decks/Flashcard.tsx:37-48`

```ts
try { await platform.playTargetText(...); }
catch { /* Best-effort — don't surface speech errors to the user; the answer is still readable. */ }
```

The comment is reasonable in spirit (the answer text is right there), but in practice this hides three failure classes that users will hit:
1. **DEBT-003 (JA/ZH degraded TTS):** if browser SpeechSynthesis throws for `ja`/`zh` voices, the user sees a "Speaking…" → "Play" toggle with no audio and no signal that anything went wrong. They click again. And again.
2. **iOS Safari user-gesture quirk** (`references/repeaty-pwa.md`): if `playTargetText` is invoked outside a tap handler (e.g. via the future autoplay-on-reveal feature), it silently fails.
3. **Real bugs:** an `onerror` event with `error: 'language-unavailable'` is structured information that should reach a logger, not be discarded. Without telemetry, beta users will report "TTS doesn't work" with no diagnostic trail.

**Fix:** at minimum, `console.error('TTS failed', err)` so the message surfaces in DevTools / Sentry once it's wired. Better: a transient `toast` ("Audio unavailable — read the text").

## Info

### I-1 — `dueAt` is exported from `@repeaty/shared` but `isDue` does the same `new Date(state.due) <= now` check
`packages/shared/src/fsrs.ts:99-101`. Two equivalent helpers; consumers should pick one. Not a bug.

### I-2 — `seed-decks.ts` skips `cards.length === 0` decks with a `console.warn`, which is a silent-fail path on a generation script
`scripts/seed/seed-decks.ts:102-105`. If a YAML deck loses all its cards by accident, the migration silently omits it (and downstream tests pass because they already expect 2 bundled decks). A typo'd YAML file with `cards: []` ships an empty deck that's still in the file but not in the migration. Consider failing the script (or at least exiting non-zero for CI) when a deck is empty unless explicitly marked `skip: true`.

### I-3 — `webPlatform.cancelSpeech` is a no-op when `getSynth()` returns null
`apps/web/src/platform/web.ts:37-40`. Correct behavior, but the symmetric situation in `playTargetText` throws ("SpeechSynthesis is not available"). The Flashcard component checks `canSpeak()` before showing the Play button, so this path is unreachable in practice — but the asymmetry is worth a comment.

## Reproduction-friendly summary

| Finding | Repro                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------- |
| W-1     | Fresh signup, observe non-deterministic CTA target (ES vs FR) across reloads                        |
| W-2     | Concurrent `submitRating` in a test (two `submitRating(Good)` without await between)                |
| W-3     | Navigate to `/app/decks/<bad-uuid>/review`; "Nothing due" misleads                                  |
| W-4     | Mock platform.playTargetText to reject; click Play; observe no signal in UI/logs                    |

## Fix-request files generated

- `requests/phase-2-fixes/fix-bug-due-cards-deterministic-top-deck.md` (W-1)
- `requests/phase-2-fixes/fix-bug-review-session-double-submit-guard.md` (W-2)
- `requests/phase-2-fixes/fix-bug-review-session-deck-not-found.md` (W-3)
- `requests/phase-2-fixes/fix-bug-flashcard-tts-error-logging.md` (W-4)

## Blocking
None. No Critical findings. The phase is mergeable per the skill's blocking rule.
