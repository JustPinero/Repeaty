# Bughunt — debt-cleanup branch (PR #1)

Adversarial review of the new attack surface introduced by the four resolved DEBT entries (003, 005, 008) + the cursor refactor + the partial DEBT-007. The pre-existing surface (Phase 1–6) is out of scope; phase audits already covered it.

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 2     |
| Low      | 3     |

## Findings

### Med-1 — `tts-jazh` in-memory blob cache is unbounded

`apps/web/src/platform/web.ts:17` declares `const ttsBlobCache = new Map<string, Blob>();` keyed on `${lang}|${text}`. Every distinct (lang, text) pair from a session adds an entry; nothing ever evicts.

For Ben's actual usage pattern this is bounded by the deck size. A 35-card ja deck × 35-card zh deck × possible repeats = ≤ 70 distinct keys, each holding an mp3 blob (typically 3–15 KB for ≤ 200-char text). Worst-case ~1 MB resident. Not a leak in any meaningful sense for the v1 single-user beta.

**But** if Ben (a) studies multiple ja/zh decks in one tab session without refresh, or (b) scrolls a long pronunciation history view that re-plays distinct phrases, the Map only grows. Tab tenure during a long study session is the exposure window.

Severity Medium because the risk is observable (browser memory) but bounded by deck-card-count, not arbitrary user input. Worth an LRU bound (`Map` insertion-ordered + delete-first-key when `size > 64`) before activating other Pro languages, but not blocking for v1.

→ Fix request: `requests/post-merge-fixes/fix-optimize-tts-cache-lru.md`

### Med-2 — `useOfflineReplay`'s `uploadAndScore` doesn't clear the cached `uploaded_path` if the storage object is later GC'd or invalid

`useOfflineReplay.ts:114–129`: on a partial failure (upload OK, function call fails), the `uploaded_path` persists into the queued row so retries skip re-upload. The 5-attempt poison-pill is the only escape hatch.

Edge case: the path is uploaded, retention sweeps it (DEBT-005's `audio-retention` Edge Function deletes blobs for free-tier rows after 7 days), and then the queue retries — `score-pronunciation` will fetch a now-404 blob and fail forever. After 5 attempts the row drops with a console warning.

Free-tier retention is 7 days; the offline queue is unlikely to sit unflushed for 7 days unless the user is offline that entire time. The poison-pill is the correct backstop (better than re-uploading a stale checkpoint). Logging "[offline-replay] score-pronunciation failed" five times into the user's console is the only user-facing signal. Low-impact for v1 single-user beta but worth a comment near the `uploaded_path` field documenting the assumption.

### Low-1 — `visited` Set is bounded by the queue size, not "unboundedly growing"

The audit brief asks to confirm `visited` (`offline-queue.ts:214`) can't grow unboundedly during a normal drain.

**Analysis:**
- `visited` is allocated fresh per-queue per-call to `replayQueues`.
- It only gains entries when `tally.retained === true && item.id !== undefined` (line 232) — i.e., transient-fail rows that bumped `attemptCount` but stayed in the queue.
- Items dropped via poison-pill (`item.attemptCount + 1 >= MAX_ATTEMPTS`) are deleted from the table inside `processOne` (line 286), and `processOne` returns `retained: false`. So they're NOT added to `visited` — and even if they were, `.first()` wouldn't find them again (deleted). ✓ confirmed.
- Items flushed cleanly (`result.ok`) are deleted (line 266), `retained: false`. Not added.
- The cursor's `.filter((row) => !visited.has(row.id ?? -1)).first()` re-reads the index every iteration. Mid-drain inserts (the new test `cursor-based drain picks up rows enqueued mid-handler in the same pass` covers this) get picked up.

Upper bound on `visited` size: the number of rows that fail transiently in this pass × queues. Each row can fail up to 4 times before the 5th-attempt drop, so `visited` size is ≤ row-count of the queue at drain start. For Ben's usage: dozens at most. Not a leak.

**One caveat:** if a rogue handler returns `{ ok: false }` but then the test/race-induced re-entrancy ends up enqueuing a NEW row with the SAME id (impossible with Dexie auto-increment but possible in adversarial tests) — `visited` would block that new row. Real-world impossible, called out for completeness.

Confirmed safe. ✓

### Low-2 — DEBT-006 E2E flake remains unfixed (re-confirmed deferred)

`e2e-manifest.json:21` carries `"pronunciation-session": { "status": "in-progress" }`. Commit `5306820` reverts the Hypothesis-B fix in CI; spec body keeps the new waits as a partial Hypothesis-B implementation. Manifest update was the conscious revert.

Acknowledged-but-not-blocking per the audit brief. Confirmed deferred. The spec runs locally green; CI runner sees a bundled-decks query race the explicit waits don't fully cover. Phase-N retro work, not a v1 launch blocker.

### Low-3 — `audio-retention` partial-batch failures are correctly defended (covered by tests)

The audit brief asks to confirm `audio-retention`'s batching is safe against partial-batch failures. `handler.ts:99–119`:

1. `failedPaths` Set collects per-batch errors.
2. `successfulIds` collects only the rows whose paths AREN'T in `failedPaths`.
3. `nullPathsForAttempts(successfulIds)` — failed-path rows stay in the table for the next run to retry.

Test `partial storage failure — successful paths still get nulled; errors logged` (handler.test.ts:125) asserts exactly this. ✓

One nit: a path that succeeds in batch N but fails in batch N+1 is impossible because each path is in exactly one batch (`allPaths.slice(i, i + STORAGE_REMOVE_BATCH)` is non-overlapping). Confirmed safe.

### Low-4 — `tts-jazh` Pro client-side path doesn't sanity-check response Content-Type

`web.ts:51–58` checks `response.ok` and calls `response.blob()` — but doesn't verify the response is `audio/mpeg`. If the Edge Function (or a misconfigured Cloudflare proxy) ever returns JSON with a 200, the audio element would silently fail to play (caught by the `.error` listener on the audio element in `playBlobThroughAudio`, which rejects → no fall-through to SpeechSynthesis happens because the fall-through is only on the fetch step). The user gets a "TTS playback failed" log + nothing audible.

Hardening: check `response.headers.get('Content-Type')?.startsWith('audio/')` before calling `.blob()`. Low because the Edge Function side has tight contract tests that would catch a regression.

### Low-5 — `tts-jazh` AbortController timer leak on success path is correctly cleaned up

The 15s `setTimeout` in `web.ts:144` is cleared in `finally`. ✓

### Re-confirmed safe

- `audio-retention` is service-role-only — `isAuthorizedServiceRole` checks the apikey header, no JWT path. Browsers cannot reach this function. Test `returns 401 without service-role apikey` covers. ✓
- `tts-jazh` rate limit (`bumpRateLimit('tts_jazh', 100)`) — `getUserFromJwt` resolves the JWT under user-context so the SECURITY DEFINER `auth.uid()` resolves correctly. Pattern matches `generate-feedback`. ✓
- Pronunciation queue `audio_blob` field is a `Blob` in the type. fake-indexeddb's structured-clone doesn't preserve `Blob` prototype reliably (test note documents it); production IndexedDB does. Replay handler in `useOfflineReplay.ts:117` calls `uploadPronunciationBlob(row.audio_blob, …)` which expects a Blob. Real-IDB roundtrip is sound. ✓
