# Fix — Replay loop processes a snapshot of the queue; rows added mid-drain land out-of-order on the next pass

**Severity:** Medium (bughunt-phase-6 Med-1)
**Originating audit:** Phase 6 bughunt
**Discovered:** 2026-04-30

## Root cause

`apps/web/src/lib/offline-queue.ts:127-130`:

```ts
const items = await db
  .table(queue)
  .orderBy('clientCreatedAt')
  .toArray();
for (const item of items as Array<…>) { … }
```

The loop snapshots the queue at the start. If a new `enqueueReview` lands during the drain (the user flips back online mid-replay, or two tabs are draining simultaneously), the new row is appended to Dexie but the in-flight loop's snapshot doesn't see it.

The next drain picks it up — fine. But the new row's `clientCreatedAt` may be older than items still in the snapshot's tail (e.g. if the system clock jitters or if two tabs differ by milliseconds). The strict chronological-order invariant is silently violated in that rare case.

Real-world impact: low. Clock skew between `enqueue` calls from the same browser tab is rare; the FSRS state on `reviews` upsert is keyed on `(user_id, card_id)` so even an out-of-order replay is idempotent for the same card. Different cards process independently.

## Acceptance criteria (non-blocking — log for v1.x)

- [ ] Re-fetch the queue inside the loop OR use `db.table(queue).toCollection().each(...)` for a Dexie-cursor-based iteration that sees rows added during the drain.
- [ ] Test case: enqueue 1 row, start a slow `replayReview` handler, mid-handler enqueue a 2nd row with an older `clientCreatedAt`, assert order on the next drain.

## Files to touch

- `apps/web/src/lib/offline-queue.ts`
- `apps/web/src/lib/offline-queue.test.ts`

## Optional — defer

Single-tab single-user beta makes this low-priority. Reasonable to leave as a known v1 limitation and revisit when multi-tab or rapid-flap connectivity scenarios become real.
