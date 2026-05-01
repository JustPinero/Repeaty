# Bughunt — Phase 6

Adversarial review of the new Phase-6 attack surface: offline-queue replay, service-worker caching pattern, vite-plugin-pwa lifecycle, InstallHint platform sniffing, and the query-cache-invalidation contract from `useOfflineReplay`.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 1     |
| Medium   | 3     |
| Low      | 3     |

## Findings

### High-1 — `useOfflineReplay` invalidates a query key that no component uses

`apps/web/src/lib/useOfflineReplay.ts:37`:

```ts
qc.invalidateQueries({ queryKey: ['due-cards-summary'] });
qc.invalidateQueries({ queryKey: ['card-comprehension-history'] });
qc.invalidateQueries({ queryKey: ['card-pronunciation-history'] });
```

The dashboard's due-cards query in `apps/web/src/features/dashboard/useDueCards.ts:41` uses `queryKey: ['due-cards', userId]`, NOT `['due-cards-summary']`. TanStack Query's `invalidateQueries` filter does prefix-matching on array keys — `['due-cards-summary']` does not match `['due-cards', userId]`. The invalidation is a no-op for the path that matters most: the dashboard's "X cards due today" widget that Ben sees first when he reopens the app post-reconnect.

Effect on Ben's first 30 minutes: he rates 5 cards on the subway, comes back online, opens the app — the dashboard still shows the pre-offline due count until something else triggers a refetch (page reload, route change, mount). This is exactly the kind of "did my work even save?" moment that looks broken.

`['card-comprehension-history']` and `['card-pronunciation-history']` invalidations DO match (the per-card history queries use `['card-comprehension-history', cardId, userId, limit]`), so those are fine — but the dashboard one is the visible bug.

→ Fix request: `requests/phase-6-fixes/fix-bug-offline-replay-invalidation-key.md`

### Medium-1 — Concurrent-drain race in `useOfflineReplay`

`useOfflineReplay`'s `running` flag is a closure-local boolean, not a ref. It guards against re-entrancy from the same hook instance, but:

1. The hook is mounted once in `App.tsx` via `<OfflineReplayMount />`. That single instance's `running` flag is fine for `online`-event-triggered drains.
2. Mount-time `if (window.navigator.onLine) void drain()` and a near-simultaneous `online` event both schedule drains. The first sets `running = true` and starts; the second sees `running === true` and bails. Good.
3. **But** if the user logs out and back in (`AuthProvider` remounts), the effect re-runs — a stale closure from the previous mount could be holding `running = true` if the in-flight `drain()` errored without entering the `finally`. The current `try { … } finally { running = false }` covers thrown errors, so the closure resets. OK.
4. **The actual race:** `replayQueues` does its iteration with `let items = await db.table(queue).orderBy('clientCreatedAt').toArray()` and then awaits each handler in series. If a second call to `enqueueReview` lands DURING the drain (the user's offline state flips back to false during a session), the new row is appended to Dexie but the in-flight loop's snapshot doesn't see it. Next drain picks it up — that's fine. But the new row's `clientCreatedAt` may be older than items still in the snapshot's tail (clock skew), and they're processed out-of-order.

Low real-world impact (clock skew of seconds between two enqueues from the same browser tab is unlikely), but the reverse-chronological replay invariant is silently violated in the rare case. Not a blocker.

→ Fix request: `requests/phase-6-fixes/fix-bug-replay-loop-snapshot-staleness.md`

### Medium-2 — `OfflineBanner` was not built; user has no signal that an offline rating was captured

Request 6.4 calls for `OfflineBanner` showing queue depth + last-replay timestamp. Neither file exists. When Ben rates a card offline, the rating advances locally (the `setQueue` / `setReviewedCount` state updates fire) — but there's no UI cue that the rating is queued vs persisted. He may not even know he was offline. On reconnect, the queue silently drains; no "synced 5 reviews" toast.

This is the category of UX gap that produces "did it work?" doubt, which actively degrades the first 30 minutes. Not a security or correctness bug; a missing UX affordance the request budgeted for.

→ Fix request: `requests/phase-6-fixes/fix-bug-offline-banner-ux.md`

### Medium-3 — Pronunciation offline path fails opaquely

`usePronunciationSession.submitRecording` (apps/web/src/features/pronunciation/usePronunciationSession.ts:107) calls `uploadPronunciationBlob` → `supabase.functions.invoke('score-pronunciation', …)`. Neither has an `if (!navigator.onLine)` guard. Offline:

- `uploadPronunciationBlob` → supabase-js → `fetch` → `TypeError: Failed to fetch` → the `try` block exits with an error.
- `MicCapture` (the consumer) treats this as a generic recording error and stays in the "recorded, retry?" state.

DEBT-008 explicitly defers the proper enqueue path. Acceptable v1 behavior per the audit brief — but the user-visible message is "Score-pronunciation returned no data" or similar, NOT "you're offline; pronunciation needs a connection". A short, explicit offline check that surfaces a clearer message would close the worst part of the UX gap without committing to the full enqueue infra.

→ Fix request: `requests/phase-6-fixes/fix-bug-pronunciation-offline-message.md`

### Low-1 — `*.supabase.co/(rest|storage|functions|auth)/` regex correctly excludes hosted JS / static

The vite-plugin-pwa runtime caching pattern in `apps/web/vite.config.ts:42` is `/\.supabase\.co\/(rest|storage|functions|auth)\//`. Confirmed it does NOT match a hosted-static URL like `https://abcd.supabase.co/static/foo.js` (no `/rest|storage|functions|auth/` segment) — those would fall through to the precache-or-default behavior, which is `NetworkOnly` if not precached. No cache-poisoning surface from a Supabase-hosted JS asset getting CacheFirst by accident. Storage user uploads (audio) hit `/storage/v1/object/...` which DOES match → NetworkOnly → no caching of audio downloads. Good.

The pattern is also greedy enough to cover Supabase's `/auth/v1/token?grant_type=...` calls (which the `auth` segment catches) — JWT refresh responses won't be cached. Good.

(No fix-request — pattern is correct.)

### Low-2 — `skipWaiting + clientsClaim` mid-session takeover

`vite.config.ts:46-47` sets both `skipWaiting: true` and `clientsClaim: true`. A new SW deployed during an active session takes over without a reload prompt. Risk: a `useReviewSession` that has React state holding `queue` + `reviewedCount` survives the SW swap because the SW swap doesn't reload the page — but a runtime-cache rule change (e.g. shifting from CacheFirst to NetworkOnly on `/peaty/*`) starts applying mid-session. For Phase 6 with these two strategies (CacheFirst on Peaty assets that don't change without a hash; NetworkOnly on supabase.co — already not-cached), the user-visible impact of a mid-session SW change is negligible.

The bigger risk is post-deploy: `registerType: 'autoUpdate'` means a new SW activates on the user's next page open. The `onOfflineReady` callback fires; there's no `onNeedRefresh` handler that prompts the user. The user keeps running on the old chunks until they happen to navigate to a route requiring a freshly-deployed chunk, which then 404s in the browser (the JS file's hashed name no longer exists). Modern Vite + Workbox typically handles this with the precache manifest, but without explicit `onNeedRefresh` UX we're trusting the precache fully. For a single-user beta, fine.

(No fix-request — single-user beta tolerance.)

### Low-3 — `InstallHint`'s `navigator.standalone` cast is correct

`apps/web/src/features/dashboard/InstallHint.tsx:22-23`:

```ts
const standalone =
  'standalone' in window.navigator &&
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;
```

Confirmed:
- `'standalone' in window.navigator` is the correct presence check; it's iOS-Safari-specific and doesn't exist in standard `Navigator`.
- The cast through `unknown` then to a typed shape is the recommended TS escape; no `// @ts-expect-error` needed.
- `=== true` (not truthy-check) is right — undefined-on-non-iOS reads as falsy correctly.
- The wrapping `'MSStream' in window` exclusion correctly filters out IE/old Edge mobile that fakes iPhone in UA strings.

No bug. Logged for completeness because the audit brief flagged it.

(No fix-request.)

## Items confirmed safe

- `enqueueReview`, `enqueueComprehension`: both `await getOfflineDb().pending_xxx.add(...)` — Dexie's `add` returns the auto-incremented id; not used here, but the await is correct.
- `replayQueues` per-row `await db.table(queue).delete(item.id!)` correctly removes successful items before counting `flushed += 1` so a crash mid-iteration leaves the next item in queue.
- The 5-attempt poison-pill drop uses `attemptCount + 1 >= MAX_ATTEMPTS` (apps/web/src/lib/offline-queue.ts:138). Correct off-by-one — attempt 0 + four bumps = 5 total tries before drop.
- The `pending_reviews` and `pending_comprehension_attempts` Dexie schemas index `user_id`, `card_id`, `clientCreatedAt` — `orderBy('clientCreatedAt')` uses the index; not a table scan.
- The `clientCreatedAt: Date.now()` timestamp is set inside `enqueueReview` / `enqueueComprehension` from the caller's clock. No timezone math; Dexie stores the raw number; replay's `orderBy` works on numeric ascending. Clock skew is the only failure mode (Med-1 above).
- No prompt-injection surface in the Phase-6 changes (all prompt-affecting code is Phase-5 territory).
- No new RLS surface — all writes still go through existing policy-protected tables (`reviews`, `comprehension_attempts`).
