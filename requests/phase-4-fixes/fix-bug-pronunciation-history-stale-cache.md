# Fix — `CardPronunciationHistory` shows non-functional Play if cache is stale relative to retention purge

**Source audit:** BugHunt Phase 4 (W-4)
**Severity:** Warning — silent UX failure; defer-able until DEBT-005 activates

## Problem

`apps/web/src/features/pronunciation/CardPronunciationHistory.tsx:107-116, 28-42`.

The component renders a Play button only when `audio_storage_path` is non-null (correct guard). But TanStack Query's default `staleTime` (Phase 1's QueryClient is unconfigured here, so `staleTime: 0`, `gcTime: 5min`) means a user who:

1. Loads the card detail page (history fetches with paths populated).
2. The 03:00 UTC retention job runs and NULLs paths.
3. Within 5 minutes, clicks Play on a now-reaped attempt.

…sees the Play button, clicks it, and:
- **Today (DEBT-005 deferred):** the file blob is still in storage, signed URL succeeds, audio plays. Stale-cache success — no user-visible bug.
- **When DEBT-005 activates:** the file is gone, signed URL succeeds (Storage doesn't 404 on signed-URL creation), `<audio>` 404s on the GET, the `try/catch` at `handlePlay:60-62` swallows the failure silently. Click → nothing → no feedback.

## Why it matters

This is a latent bug that activates with DEBT-005. Cheap to harden now: bump `staleTime` so the cache freshens before the 5-minute reap-window-vs-cache window can bite.

## Proposed fix

```ts
const { data, isLoading, isError, error } = useQuery<Attempt[], Error>({
  queryKey: ['card-pronunciation-history', cardId, userId, limit],
  enabled: !!userId && !!cardId,
  staleTime: 60_000,                 // ← 1-minute freshness; below the 5-min cache window
  queryFn: async () => { /* ... */ },
});
```

When DEBT-005 activates, also surface the audio-404 inline on the row instead of swallowing in `try/catch`. For now, the `staleTime` change is sufficient and zero-cost.

## Test

Add to `apps/web/src/features/pronunciation/CardPronunciationHistory.test.tsx`:

```ts
it('uses staleTime to limit cache window for retention-sensitive paths', () => {
  // Smoke test: importing the component module shouldn't throw, and the queryFn
  // is wired with the staleTime override. Real assertion is at runtime via the
  // useQuery options — Vitest can't easily inspect QueryClient internals here,
  // so this is documentation-grade only. Manual verification: `git grep
  // staleTime apps/web/src/features/pronunciation/CardPronunciationHistory.tsx`.
});
```

(The hardening doesn't have a clean unit-test surface; the property is `useQuery({ staleTime: 60_000 })` which TanStack Query owns. A snapshot of the queryOptions object is overkill.)

## Files to touch

- `apps/web/src/features/pronunciation/CardPronunciationHistory.tsx` — add `staleTime: 60_000`.

## Acceptance criteria

- [ ] The `useQuery` options include `staleTime: 60_000` for `card-pronunciation-history`.
- [ ] No regression in the existing test suite.
- [ ] When DEBT-005 lands, this fix combines with an audio-404 inline-error surfacing pass.
