# Fix — No test for "client overwrites only when client row strictly older"

**Severity:** Low (test-audit-phase-6 Low-1 — paired with drift-audit Med-1)
**Originating audit:** Phase 6 test-audit
**Discovered:** 2026-04-30

## Root cause

`references/repeaty-pwa.md` § Offline queue (pre-patch wording) and `requests/phase-6-pwa-launch/6.4-offline-queues-dexie.md` both promised: "Conflict resolution: server wins; client overwrites only when a review for the same card was strictly older."

Shipped behavior in `apps/web/src/lib/useOfflineReplay.ts:60-72`: `supabase.from('reviews').upsert(..., { onConflict: 'user_id,card_id' })` — overwrites unconditionally.

The drift-audit patched the doc to match shipped behavior (single-user beta tolerance). This fix-request captures the code-side option of activating the stricter rule before multi-user beta or as a v1.x polish.

## Acceptance criteria

- [ ] `useOfflineReplay`'s `upsertReview` reads the existing server-side `reviews.last_reviewed_at` for `(user_id, card_id)` before the upsert.
- [ ] If `server.last_reviewed_at > queuedRow.clientCreatedAt` (server is newer), skip the upsert + treat as flushed (the queued row is stale).
- [ ] Else proceed with the upsert.
- [ ] New test cases: queued-row-newer (upsert lands), queued-row-older (skip + flush), no-existing-row (insert).
- [ ] `references/repeaty-pwa.md` § Offline queue rewords back to the strict rule once shipped.

## Files to touch

- `apps/web/src/lib/useOfflineReplay.ts`
- `apps/web/src/lib/useOfflineReplay.test.ts` (new — see also `fix-bug-offline-replay-invalidation-key.md` which proposes the same file)
- `references/repeaty-pwa.md` (re-tighten wording after activation)

## Optional — defer

Single-user beta makes this low-priority; same-card replay racing a more-recent server-side change is unlikely with one user. Reasonable to leave as a known v1 simplification and revisit when multi-user or device-sync requirements arrive.
