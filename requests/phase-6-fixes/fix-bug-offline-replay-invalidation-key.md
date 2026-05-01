# Fix — `useOfflineReplay` invalidates a query key that no component uses

**Severity:** High (bughunt-phase-6 High-1)
**Originating audit:** Phase 6 bughunt
**Discovered:** 2026-04-30

## Root cause

`apps/web/src/lib/useOfflineReplay.ts:37` calls:

```ts
qc.invalidateQueries({ queryKey: ['due-cards-summary'] });
qc.invalidateQueries({ queryKey: ['card-comprehension-history'] });
qc.invalidateQueries({ queryKey: ['card-pronunciation-history'] });
```

The dashboard's due-cards query at `apps/web/src/features/dashboard/useDueCards.ts:41` uses `queryKey: ['due-cards', userId]`, NOT `['due-cards-summary']`. TanStack Query's prefix-matching means `['due-cards-summary']` does not match `['due-cards', userId]` — the invalidation is a no-op for the dashboard.

`['card-comprehension-history']` and `['card-pronunciation-history']` DO prefix-match `['card-comprehension-history', cardId, ...]` and `['card-pronunciation-history', cardId, ...]` respectively. Those are correct.

## User impact

Ben rates 5 cards on the subway → reconnects → opens the app → the dashboard still shows the pre-offline due count. The dashboard refreshes only on a page reload, route change, or other invalidation event — not after the offline replay drains.

This is the canonical "did my work even save?" UX failure that meaningfully degrades a first-time user's confidence in the app.

## Acceptance criteria

- [ ] `useOfflineReplay`'s post-flush invalidation includes `['due-cards', userId]` (or a prefix that matches it).
- [ ] Existing `['card-comprehension-history']` + `['card-pronunciation-history']` invalidations are preserved.
- [ ] A new test in `useOfflineReplay.test.ts` (or a new test file) asserts that after `replayQueues` returns `flushed > 0`, the QueryClient's `['due-cards', ...]` query is marked stale.

## Suggested patch

```ts
// apps/web/src/lib/useOfflineReplay.ts
if (result.flushed > 0) {
  qc.invalidateQueries({ queryKey: ['due-cards'] });            // matches ['due-cards', userId]
  qc.invalidateQueries({ queryKey: ['card-comprehension-history'] });
  qc.invalidateQueries({ queryKey: ['card-pronunciation-history'] });
}
```

(Bare `['due-cards']` correctly prefix-matches the userId-bound query without forcing the hook to know `userId`.)

## Files to touch

- `apps/web/src/lib/useOfflineReplay.ts`
- `apps/web/src/lib/useOfflineReplay.test.ts` (new) — at minimum a render-and-drain test asserting `qc.getQueryState(['due-cards', 'u-1'])?.fetchStatus !== 'idle'` after flush, or a `qc.getQueryCache().getAll()` snapshot showing the relevant key invalidated.
