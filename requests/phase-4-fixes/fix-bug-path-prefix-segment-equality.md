# Fix — Replace `startsWith` path-prefix guard with segment-anchored equality

**Source audit:** BugHunt Phase 4 (W-1)
**Severity:** Warning — defensive improvement; not exploitable today (UUIDs save us)

## Problem

`supabase/functions/score-pronunciation/handler.ts:137`:

```ts
if (!parsed.audio_storage_path.startsWith(`${user.id}/`)) {
  return jsonError('FORBIDDEN_TIER', 'audio_storage_path must start with the caller user_id');
}
```

The check uses `startsWith(\`${user.id}/\`)` which is sound for UUIDs (no two UUIDs share a `/`-terminated prefix). The bucket policy in 0011 (`(storage.foldername(name))[1]`) does *segment-anchored* equality. The Edge Function's defense-in-depth check is *less* strict than the policy it's defending — a future change to non-UUID identifiers (anonymous-user `anon-N` scheme, slug-based ids, or any prefix-collision-prone format) would silently break the guard.

This is a 2-line drop-in defensive improvement. Future-proof; closes the strictness gap.

## Proposed fix

Replace lines 137-148 of `supabase/functions/score-pronunciation/handler.ts`:

```ts
const segments = parsed.audio_storage_path.split('/');
if (segments[0] !== user.id || segments.length < 3) {
  return finalize({
    deps,
    requestId,
    startedAt,
    userId: user.id,
    result: jsonError(
      'FORBIDDEN_TIER',  // or FORBIDDEN_RESOURCE if that lands first — see fix-drift-forbidden-resource-code.md
      'audio_storage_path must be of the form `${user_id}/${card_id}/<file>`',
    ),
  });
}
```

The `segments.length < 3` check rejects malformed paths (e.g. `${user_id}/extra-only.webm`) that pass `startsWith` today.

## Files to touch

- `supabase/functions/score-pronunciation/handler.ts` — replace the `startsWith` guard.
- `supabase/functions/score-pronunciation/handler.test.ts` — extend the existing 403 test with two extra cases: (a) `${user_id}-other/...` (would have passed `startsWith` if user.id were a non-UUID prefix) and (b) `${user_id}/lone-segment.webm` (rejected by the new `length < 3` check).

## Acceptance criteria

- [ ] All existing handler tests still pass.
- [ ] New tests assert that segment-anchored equality blocks both prefix-collision and malformed-segment-count cases.
- [ ] No production behavior change for valid UUID paths.
