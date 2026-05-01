# Fix — `OfflineBanner` was scoped but not built

**Severity:** Medium (test-audit-phase-6 Med-3 / bughunt-phase-6 Med-2 — same root)
**Originating audit:** Phase 6 test-audit + bughunt
**Discovered:** 2026-04-30

## Root cause

Request 6.4 lists `apps/web/src/features/dashboard/OfflineBanner.{tsx,test.tsx}` under files-to-touch — a small component showing queue depth + last-replay timestamp for beta-debug visibility. Neither file exists.

Without the banner, the user-visible signal that an offline rating was even captured is entirely missing. Ben rates a card on the subway, the local UI advances normally, the row queues — but he sees no "queued for sync (1 pending)" or similar affordance. On reconnect, the queue silently drains. This is the difference between "this app is offline-aware" and "I have no idea if my work saved."

This is on the boundary of "missing UX affordance vs functional bug." Per the audit brief, it does meaningfully degrade Ben's first 30 minutes if the connection is flaky.

## Acceptance criteria

- [ ] `apps/web/src/features/dashboard/OfflineBanner.tsx` mounts in `Dashboard.tsx`.
- [ ] Reads `queueDepth()` from the offline-queue module on a `setInterval` (5s acceptable) or by listening to a dispatched event after `replayQueues`.
- [ ] When `pendingReviews + pendingComprehensionAttempts > 0`, renders a small pill: "Sync pending: N item(s)" with a tooltip-or-text "Will sync when you're back online."
- [ ] When `flushed` rows just landed, render "Synced N item(s) just now" for ~5s.
- [ ] `OfflineBanner.test.tsx` covers the three states (empty / pending / just-synced).

## Files to touch

- `apps/web/src/features/dashboard/OfflineBanner.tsx` (new)
- `apps/web/src/features/dashboard/OfflineBanner.test.tsx` (new)
- `apps/web/src/features/dashboard/Dashboard.tsx` — mount the banner.
