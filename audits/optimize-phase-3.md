# Optimize — Phase 3 (Comprehension Mode)

Mode: quick. Scope: files modified between `main` and `phase-3-comprehension` HEAD.

## Summary
- **High:** 0
- **Medium:** 4
- **Low:** 3

The phase ships clean on bundle hygiene (no new heavy deps; the only new dependency surface is `@repeaty/shared`'s two pure modules) and on database access patterns. The `comprehension_attempts` history query exactly matches the `idx_comp_user_card_created (user_id, card_id, created_at DESC)` index — one index seek + range scan, optimal. The session-fetch path is two round-trips (deck existence check + cards) matching the review-session pattern; nothing to collapse there because comprehension doesn't need to join with past attempts at session start.

No High items. The Mediums are: (1) `CardComprehensionHistory`'s "Load more" implementation refetches the whole growing list each click instead of cursor-paginating from the oldest seen `created_at` — fine for v1 attempt volume but quadratic in fetched bytes; (2) the new comprehension feature and CardDetail page are eagerly imported by the route table, so a user who never opens the comprehension flow still pays the JS for it — `React.lazy` would split it; (3) the Timer's 100ms `setInterval` causes one re-render per tick even when the user is staring at the page — fine in absolute terms but worth noting; (4) `useComprehensionSession` rebuilds the entire `cards` array on every keystroke because `data` from TanStack-Query and the local `index` state both flow through the hook closure, but `submitResponse`'s `useCallback([currentCard, userId])` re-creates on every card change.

## High
None.

## Medium

### M-1 — `CardComprehensionHistory` paginates by re-fetching with growing `limit` instead of cursor
**File:** `apps/web/src/features/comprehension/CardComprehensionHistory.tsx:23, 33-38, 90-92`

```ts
const [limit, setLimit] = useState(pageSize);
// ...
.order('created_at', { ascending: false })
.limit(limit);
// ...
<Button onClick={() => setLimit((l) => l + pageSize)}>Load more</Button>
```

Each "Load more" click increments `limit` (20 → 40 → 60 → ...) and refetches the entire prefix. At 100 attempts and 5 clicks, the user has paid for 20 + 40 + 60 + 80 + 100 = 300 row reads instead of 5 × 20 = 100. The query's index-backed; total wall-clock is acceptable, but it scales O(n²) in row-bytes returned.

Cursor pagination via `lt('created_at', oldestSeen)` keeps each page at exactly `pageSize` rows. Pattern:

```ts
const oldestSeen = data?.[data.length - 1]?.created_at;
// next page: append .lt('created_at', oldestSeen)
// state: store an array of pages, append on Load more
```

For v1 (single beta user with maybe 50 attempts/card), the difference is tens of KB. For Phase-6 multi-user with active learners, it's worth fixing. Medium because the deferred cost is real, not because v1 is hurting.

**Estimated impact:** at 200 attempts/card with 10 Load-more clicks, drops fetched-bytes from ~21 pages × 20 rows × ~150 bytes/row ≈ 63KB to 10 × 20 × 150 ≈ 30KB. Halves history-panel bytes.

### M-2 — `ComprehensionSessionPage` and `CardDetail` are eagerly imported by `routes/index.tsx`
**File:** `apps/web/src/routes/index.tsx:10` (and once C-1 lands, the new CardDetail import too)

```ts
import { ComprehensionSessionPage } from '@/features/comprehension';
```

The barrel `apps/web/src/features/comprehension/index.ts` exports `ComprehensionSessionPage`, `Timer`, `useComprehensionSession`, `CardComprehensionHistory`. Because the route table imports the page at module load, the entire comprehension feature (page + hook + Timer + canned-text + FeedbackPanel) ends up in the dashboard's initial bundle. A user who only ever runs review sessions still pays for the comprehension JS.

`React.lazy` splits the chunk:

```tsx
const ComprehensionSessionPage = React.lazy(() =>
  import('@/features/comprehension').then((m) => ({ default: m.ComprehensionSessionPage }))
);
// ... wrap the route element in <Suspense fallback={<Loading />}>
```

Same for `CardDetail` and the existing `ReviewSessionPage`. The pattern bears repeating across all leaf-route screens. Phase 6's PWA polish is the natural place to land this — but flagging now since the new code adds chunks the dashboard doesn't need.

**Estimated impact:** ~5–15KB gz off the initial bundle per lazy-split route. Multiplies as more routes ship.

### M-3 — `Timer` re-renders 10× per second via `setInterval(100)`
**File:** `apps/web/src/features/comprehension/Timer.tsx:19-22`

```ts
const id = window.setInterval(() => setNow(Date.now()), 100);
```

The component is small (one `<span>` with text content), so the per-render cost is microseconds — but 10 renders per second of the Timer subtree, while the user is typing into the input, is more work than the visible 0.1s precision needs. Two improvements:

1. **`requestAnimationFrame`-based tick** schedules updates aligned to the browser's paint cycle, so the framework batches Timer's render into the same frame as the input's typing render. Eliminates duplicate paint costs.
2. **Throttle to 250ms** if 0.25s display precision is acceptable. Halves the render count.

Today: not a measurable hot-path. Medium because Phase 5's planned "auto-submit on N-second timeout" UI may want the same Timer to drive the cutoff visually, at which point a `requestAnimationFrame` loop becomes the right shape.

### M-4 — `useComprehensionSession.submitResponse`'s `useCallback` re-binds on every card change
**File:** `apps/web/src/features/comprehension/useComprehensionSession.ts:102-150`

```ts
const submitResponse = useCallback(
  async (response: string): Promise<CardResult> => { /* ... */ },
  [currentCard, userId],
);
```

`currentCard` changes on every `next()`, so `submitResponse`'s identity changes every card. `ComprehensionSessionPage` doesn't memoize its rendering on `submitResponse`'s identity, so today this is invisible. But if a future test (or feature) memoizes over `submitResponse`, the memoization will be defeated.

Refactor: pull `currentCard` access out of the closure via a ref, mirroring `cardStartedAt.current`:

```ts
const currentCardRef = useRef(currentCard);
useEffect(() => { currentCardRef.current = currentCard; }, [currentCard]);

const submitResponse = useCallback(
  async (response: string): Promise<CardResult> => {
    const card = currentCardRef.current;
    if (!card) throw new Error('no current card');
    // ...
  },
  [userId], // ← stable per session
);
```

This is also a small simplification for the re-entrancy fix (BugHunt W-1) — both refs live together.

## Low

### L-1 — `lookupFeedback` builds the `FALLBACK_LANG` table reference on every call
**File:** `apps/web/src/features/feedback/canned-text.ts:46`

`FEEDBACK[key.nativeLangPrefix.toLowerCase()] ?? FEEDBACK[FALLBACK_LANG]` runs two property lookups per call. Negligible — measured in nanoseconds. Don't optimize.

### L-2 — `comprehensionScore`'s linear interpolation re-derives constants on every call
**File:** `packages/shared/src/comprehension-score.ts:32-34`

```ts
const t = (responseMs - FAST_THRESHOLD_MS) / (SLOW_THRESHOLD_MS - FAST_THRESHOLD_MS);
speedFactor = 1 - t * (1 - SPEED_FLOOR);
```

The `SLOW_THRESHOLD_MS - FAST_THRESHOLD_MS` and `1 - SPEED_FLOOR` are both compile-time constants (28000 and 0.5). A modern JS engine constant-folds these; manual hoisting is theater. Skip.

### L-3 — `ComprehensionSessionPage` recreates `handleSubmit` and `handleNext` on every render
**File:** `apps/web/src/features/comprehension/ComprehensionSessionPage.tsx:37-50`

Same as Phase-2 review's L-2: only matters if the `<form>` and `<Button>` are memoized. They aren't. `useCallback` here saves zero. Skip.

## Bundle / cost notes

- `@repeaty/shared`'s `similarity.ts` and `comprehension-score.ts` add ~1.5KB gz total. The Levenshtein implementation is two-row DP; no library footprint. No new shared deps.
- `apps/web/src/features/feedback/canned-text.ts` ships ~0.5KB of inline strings. Five languages × 2 buckets × ~80 chars each. Trivially loaded; no need for code-splitting per locale at this volume.
- No new dependencies in `apps/web/package.json` for Phase 3. The diff vs main is only re-resolution of the existing tree.
- `references/architecture.md`'s "Dependency log" doesn't need a new section for Phase 3 — confirmed by DriftAudit's pass on architecture.md.
- The integration test (`comprehension-attempts-rls.test.ts`) is fast: three SQL ops, no LLM calls.

## Top three improvements (ranked by impact)

1. **Cursor-paginate `CardComprehensionHistory`.** Shifts O(n²) fetched-bytes to O(n) for power users. Easy fix, well-bounded. Medium on its own; combined with Phase-4's planned pronunciation history (which copies this pattern), it's worth doing once.
2. **`React.lazy` the route-leaf pages.** Cuts initial-bundle JS for users who haven't opened comprehension yet. Pairs with Phase 6's PWA polish — landing the pattern now lets Phase 4 inherit it.
3. **Stabilize `submitResponse` identity via a `currentCardRef`.** Defensive plumbing for the re-entrancy fix (BugHunt W-1) and any future memoization work.

## Fix-request files generated

None — all findings are Medium or Low. Per the skill spec, only High items get fix-requests. Mediums live in this report only; the user decides if they become requests.

## Non-blocking
Optimize never blocks a phase. Phase 3 is clear from the perf axis.
