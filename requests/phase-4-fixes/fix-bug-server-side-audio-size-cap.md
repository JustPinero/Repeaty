# Fix — Enforce 10MB audio cap server-side in `score-pronunciation`

**Source audit:** BugHunt Phase 4 (W-5)
**Severity:** Warning — pre-flagged Phase-5 work, but bypass is real today

## Problem

`apps/web/src/features/pronunciation/storage.ts:5` defines `MAX_AUDIO_BYTES = 10 * 1024 * 1024` and enforces it *helper-side only* (line 41-45). A direct call to the `score-pronunciation` Edge Function with a `audio_storage_path` pointing at a larger blob bypasses the cap entirely. The Edge Function downloads the full blob (`handler.ts:151`) and forwards it to OpenAI Whisper.

OpenAI's Whisper file-size limit is 25MB; Supabase Storage's per-bucket limit is unset by default. An authenticated user can:
1. Upload a >10MB blob via direct supabase-js call (bypassing the helper).
2. Call the Edge Function with that path.
3. The Edge Function reads up to 25MB into memory and forwards.

Per-call cost is bounded by Whisper's 25MB ≈ ~75min at 64kbps ≈ $0.45/call. With the per-user rate limit deferred to Phase 5, this is unbounded by call count.

## Why it matters

The brief explicitly defers per-user rate limiting (`requests/phase-4-pronunciation/4.4-whisper-edge-function.md:53` — "Per-user rate limiting (lands when Pro features ship in Phase 5)"). But the size cap was meant to apply server-side; the helper-side check is a UX shortcut, not the actual security boundary.

## Proposed fix

Add a server-side blob-size check after `downloadAudio`:

```ts
// supabase/functions/score-pronunciation/handler.ts
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;  // mirror of helper-side cap

// ── Audio download ────────────────────────────────────────────────────
const audio = await deps.downloadAudio(parsed.audio_storage_path);
if (!audio) {
  return finalize({ ..., result: jsonError('UPSTREAM_FAILED', 'Failed to download audio') });
}
if (audio.size > MAX_AUDIO_BYTES) {
  return finalize({
    deps, requestId, startedAt, userId: user.id,
    result: jsonError('INVALID_PAYLOAD', `audio too large: ${audio.size} > ${MAX_AUDIO_BYTES}`),
  });
}
```

Optional: extract `MAX_AUDIO_BYTES` to `packages/shared/src/edge-errors.ts` (or a sibling `pronunciation-limits.ts`) so client and server share one constant.

## Test

Add to `supabase/functions/score-pronunciation/handler.test.ts`:

```ts
Deno.test('returns 400 INVALID_PAYLOAD when audio blob exceeds 10MB', async () => {
  const huge = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'audio/webm' });
  const handler = createHandler(
    happyDeps({ downloadAudio: async () => huge }),
  );
  const req = buildRequest({ card_id: FAKE_CARD, audio_storage_path: FAKE_PATH });
  const res = await handler(req);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'INVALID_PAYLOAD');
});
```

## Files to touch

- `supabase/functions/score-pronunciation/handler.ts` — add the size guard after `downloadAudio`.
- `supabase/functions/score-pronunciation/handler.test.ts` — add the over-cap test above.
- (Optional) `packages/shared/src/` — extract `MAX_AUDIO_BYTES` to a shared module if the client and server should reference the same constant.

## Acceptance criteria

- [ ] A 10MB+ audio Blob returned from `downloadAudio` causes the handler to return 400 `INVALID_PAYLOAD`.
- [ ] The new test passes; existing tests still pass.
- [ ] No production regression for under-cap calls.
