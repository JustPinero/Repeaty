# BugHunt — Phase 4 (Pronunciation Mode)

Mode: quick. Scope: 48 files modified between `main` and `phase-4-pronunciation` HEAD (14 commits).

## Summary
- **Critical:** 0
- **Warning:** 5
- **Info:** 4

The phase ships clean on the load-bearing security axes. The new bucket has explicit path-prefix policies for SELECT/INSERT/UPDATE/DELETE, and the integration test (`bucket-rls.test.ts`) drives every cross-tenant attempt through a real signed-in client and asserts denial. The `score-pronunciation` Edge Function uses a service-role client *only* for the audio download + the attempt insert; the card visibility check uses a per-request user-context client (`index.ts:38-47`) so RLS still gates which cards a caller can transcribe. The 15s `AbortController` is wired correctly, the AbortError → `UPSTREAM_TIMEOUT` mapping is in place, and request body parse goes through Zod *after* the JWT check (so unauthenticated callers can't brute-force schema messages out of the function). The path-traversal guard (`audio_storage_path.startsWith(\`${user.id}/\`)`) is duplicated in the helper-side write path *and* in the Edge Function read path — defense-in-depth as the brief asked for.

The retention job (`purge_free_tier_audio()`) runs as `SECURITY DEFINER` with an explicit `search_path = public, storage` and `REVOKE ALL ... FROM public` on both the purge function and the test backdating helper — neither is callable by `authenticated`. The pg_cron schedule is idempotent (the migration unschedules any prior entry under the same jobname before scheduling). The `audio_storage_path` is correctly NULLed under the same WHERE clause that gates the purge, so Pro-tier rows are untouched even if a future code path mistakenly deletes their files.

The 5 Warnings are: (1) the path-prefix guard in `handler.ts` is vulnerable to a UUID-prefix collision attack — `${user.id}/` matches `userid-but-also-this-other-user-id` if the latter starts with `${user.id}` (no actual UUID does, but the check is a `startsWith` not a path-segment-equality, and a future change to non-UUID identifiers would silently break the guard); (2) `playRecordedAudio` swallows `audio.play()` rejection, hanging the outer Promise indefinitely if `play` rejects without firing an `error` event (real on iOS Safari outside user gestures); (3) `MicCapture`'s `requesting` → `recording` transition leaks a `MediaStream` if the component unmounts after `getUserMedia` resolves but before `setHandle` fires; (4) `CardPronunciationHistory.handlePlay` swallows every error silently — including signed-URL failures, network errors, and bad codecs — which is right by design but means a free-tier user whose audio was reaped sees a non-functional play button (the `audio_storage_path === null` guard *does* hide the button, but a stale React Query cache between purge and refetch leaves the path populated for up to 5 minutes); (5) the score-pronunciation Edge Function has no rate limit — a malicious authenticated user can spam Whisper at OpenAI's per-call cost (~$0.006/min of audio), and the cap-via-`MAX_AUDIO_BYTES` only fires client-side.

## Critical

**None.** No data-loss, auth-bypass, RLS-leak, crash-on-deploy, secret-leak, or unbounded-cost-from-anonymous finding. The closest to Critical is W-5 (no rate limit on Whisper calls), but the per-user authenticated bound + 10MB-per-call helper-side cap puts the worst-case daily cost in the dollars-per-day-per-attacker range, not the runaway-bill range. Phase-5's `rate_limits` table is the natural home; flagged as Warning until then.

## Warning

### W-1 — Path-prefix guard uses `startsWith` instead of segment-anchored equality

**File:** `supabase/functions/score-pronunciation/handler.ts:137`

```ts
if (!parsed.audio_storage_path.startsWith(`${user.id}/`)) {
  // ...
  return jsonError('FORBIDDEN_TIER', '...');
}
```

The check uses `startsWith(\`${user.id}/\`)` which is correct *for UUIDs*: no two UUIDs share a prefix that ends with `/`, so this is sound today. But it's a fragile contract:

- If `user.id` ever becomes a string that *can* be a prefix of another (e.g. a Phase-7 anonymous-user `anon-N` scheme, a slug-based identifier, or a custom auth claim), the check passes for cross-tenant paths.
- The `(storage.foldername(name))[1]` policy in 0011 (which is the bucket's actual enforcement) does segment-equality, not prefix-match. The Edge Function's defense-in-depth check is *less* strict than the policy it's defending. That's wrong.

**Defensive fix:**
```ts
const segments = parsed.audio_storage_path.split('/');
if (segments[0] !== user.id || segments.length < 3) {
  // ...
}
```

This matches the bucket policy's segment-anchored semantic and adds a "must have ≥3 segments (`user/card/file`)" sanity check. Drop-in 2-line change.

**Reproduction:** today none — UUIDs save us. Future-proof reproduction: change `user.id` to `'user-1'` (hypothetical). A request with `audio_storage_path: 'user-12/card-x/file.webm'` passes the current `startsWith('user-1/')` check.

### W-2 — `playRecordedAudio` hangs forever if `audio.play()` rejects without firing an `error` event

**File:** `apps/web/src/platform/web.ts:201-222`

```ts
async playRecordedAudio(blob: Blob): Promise<void> {
  // ...
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener('ended', () => { cleanup(); resolve(); });
    audio.addEventListener('error', (event) => { cleanup(); reject(...); });
    void audio.play();   // ← `play()` rejection is swallowed
  });
}
```

`HTMLMediaElement.play()` returns a Promise that rejects in three real scenarios:
- iOS Safari: outside a user gesture (reject with `NotAllowedError`).
- Autoplay policy: muted autoplay was blocked.
- Codec mismatch: blob mime type unsupported by the browser.

In each case, no `error` event fires (per spec — `error` is for in-flight playback failures, not start-up failures). The outer Promise never resolves → MicCapture's `playbackInFlight` flag stays `true` indefinitely → the "Listen back" button is permanently disabled until re-record.

**Reproduction:** in iOS Safari, render `MicCapture`, record + stop, click "Listen back" without a fresh user gesture (e.g. via `useEffect` auto-trigger). Button hangs at "Playing…".

**Fix:**
```ts
audio.play().catch((err) => {
  cleanup();
  reject(err instanceof Error ? err : new Error(String(err)));
});
```

Two lines, plus a test. The `MicCapture` callsite swallows the rejection anyway (best-effort UX), so user-visible impact is the disabled button, not a thrown error — but the `playbackInFlight = true` lock has to be released.

**Side-effect:** the existing `cleanup()` runs on the `error`-event path too, so `URL.revokeObjectURL` is called twice on simultaneous play-reject + later error-event. `revokeObjectURL` is idempotent (no-op on already-revoked) so safe.

### W-3 — `MicCapture` leaks a `MediaStream` if unmounted during the `requesting` → `recording` transition

**File:** `apps/web/src/features/pronunciation/MicCapture.tsx:33-37, 39-64`

```ts
useEffect(() => {
  return () => {
    if (handle) platform.cancelRecording(handle);
  };
}, [handle]);

async function handleStart() {
  setStatus('requesting');
  // ...
  const h = await platform.startRecording();   // ← getUserMedia opens a MediaStream
  setHandle(h);                                  // ← if unmounted before this, h is leaked
  // ...
}
```

`platform.startRecording()` calls `getUserMedia({ audio: true })` (opening a live mic stream) *before* the function resolves. If the user navigates away during the `'requesting'` state — e.g. clicks Record then immediately clicks the back button or the page's Cancel link — the React unmount runs *before* `startRecording` resolves. The cleanup effect captures the *previous* `handle` value (still `null`) and does nothing. The resolved-but-unrendered MediaStream is now orphaned: the mic LED stays on, the audio tracks stay live, and only a manual page reload reclaims the device. On iOS this leaves a "this site is using your microphone" indicator hanging in the address bar.

**Reproduction:**
1. Render `MicCapture`.
2. Click Record. While `'requesting'` is showing, navigate to another route.
3. The mic indicator stays on indefinitely (or until page reload).

**Fix:** track an `unmountedRef` and cancel the resolved handle if we unmounted between `await` and `setHandle`:

```ts
const unmountedRef = useRef(false);
useEffect(() => () => { unmountedRef.current = true; }, []);

async function handleStart() {
  // ...
  const h = await platform.startRecording();
  if (unmountedRef.current) {
    platform.cancelRecording(h);
    return;
  }
  setHandle(h);
  // ...
}
```

This pairs cleanly with the existing `cancelRecording` cleanup effect for the post-mount case, and closes the pre-`setHandle` race window.

### W-4 — `CardPronunciationHistory` shows a non-functional Play button if React Query cache is stale relative to the retention purge

**File:** `apps/web/src/features/pronunciation/CardPronunciationHistory.tsx:107-116, 28-42`

The component renders a Play button only when `audio_storage_path` is non-null (line 107). That's correct guard logic against the *retention contract* (purge NULLs the path). But TanStack Query's default `staleTime` (Phase 1's QueryClient is unconfigured here, defaulting to `staleTime: 0`, `gcTime: 5min`) means a user who:

1. Loads the card detail page (history fetches, paths are populated).
2. The 03:00 UTC retention job runs.
3. Within 5 minutes, the user clicks Play on a now-reaped attempt.

…hits `handlePlay`, which calls `createSignedUrl` against a now-deleted storage object (or *would*, but per DEBT-005, the file is currently *not* deleted — only the path is NULLed). The signed-URL call succeeds against the still-present blob, the audio plays, and the user gets a stale-cache success. That's the *good* timing case.

The *bad* timing case lands when DEBT-005 activates and the file is actually removed: `createSignedUrl` succeeds (signed URLs can be created for non-existent objects), the `<Audio>` element 404s on the GET, the `audio.onerror` handler runs, and the `try/catch` swallows the failure silently. User sees the Play button, click it, hear nothing, get no feedback. Same UX as a network error.

**Reproduction:** today, requires DEBT-005 active. With DEBT-005 deferred, the worst case is a 5-minute stale-cache window where a NULL-path attempt is still rendered with a Play button.

**Fix (today):** invalidate the `card-pronunciation-history` query key on a 7-day timer client-side. Or simpler: set `staleTime: 60_000` on this query specifically (1-minute freshness is plenty — the page isn't a hot-path).

**Fix (when DEBT-005 lands):** surface the audio-404 inline on the row, not silently. The current `try/catch` block at lines 60-62 is intentional ("Best-effort — surfacing failure inline isn't worth the UX cost"). Reconsider once retention is fully active.

### W-5 — `score-pronunciation` has no rate limit; an authenticated user can spam Whisper

**File:** `supabase/functions/score-pronunciation/handler.ts` (entire), `supabase/functions/score-pronunciation/index.ts` (entire).

The handler validates JWT, validates schema, validates path-prefix, downloads audio (10MB max — but only via the *helper-side* cap, not enforced server-side), calls Whisper. There is no per-user, per-day, or global call cap. An authenticated user can:

- Loop `submitRecording(blob)` — the hook's re-entrancy guard prevents *concurrent* duplicate calls from one mounted hook, but doesn't stop a script that calls `submitRecording → next() → submitRecording` in a loop.
- Call the Edge Function directly with a stolen JWT.

OpenAI Whisper is ~$0.006/minute of audio. With a 10MB cap (~30s opus), each call is ~$0.003. A 1000-call/hr loop is ~$3/hr ≈ $72/day per attacker. Not a runaway bill, but not nothing either.

**The brief explicitly defers per-user rate limiting to Phase 5** (`requests/phase-4-pronunciation/4.4-whisper-edge-function.md:53` — "Per-user rate limiting (lands when Pro features ship in Phase 5)"). So this is a *pre-flagged Warning*, not a missed acceptance criterion. Recording it for completeness; the fix lands with `rate_limits` in Phase 5.

**Mitigation today:** the `MAX_AUDIO_BYTES = 10 * 1024 * 1024` check in `apps/web/src/features/pronunciation/storage.ts:5` is enforced helper-side only — a direct Edge Function call with a 100MB payload would download all 100MB before Whisper rejects (well, OpenAI rejects 25MB+; Supabase Storage's per-bucket limit is the actual cap). Add a server-side blob-size guard *after* `downloadAudio`:

```ts
const audio = await deps.downloadAudio(parsed.audio_storage_path);
if (!audio) return ...;
if (audio.size > 10 * 1024 * 1024) {
  return finalize({ ..., result: jsonError('INVALID_PAYLOAD', 'audio too large') });
}
```

Closes the bypass without waiting for Phase 5.

## Info

### I-1 — Edge Function uses `FORBIDDEN_TIER` for path-traversal denial; semantically misleading

**File:** `supabase/functions/score-pronunciation/handler.ts:137-148`; `supabase/functions/score-pronunciation/handler.test.ts:120-122`.

The handler maps a path-prefix mismatch to `FORBIDDEN_TIER` (HTTP 403). The shared error enum doesn't have a dedicated path-traversal code; the test acknowledges this in a comment ("FORBIDDEN_TIER is the closest semantic match in the shared enum even though this is path-traversal, not tier — handler maps to it deliberately"). The test pins the behavior, so a future Phase-5 author calling `score-pronunciation` and seeing a `FORBIDDEN_TIER` error will assume "user is free, needs to upgrade", not "audio path is wrong".

**Suggested:** add `FORBIDDEN_RESOURCE` (or `FORBIDDEN`) to the shared enum, mapped to 403, and use it for cross-resource denial. Cheap addition (5 lines × 2 files) and clarifies the semantic. Defer to a Phase-5 chore — not blocking. Documented in drift-audit too.

### I-2 — `MicCapture` logs no telemetry on errors; debugging permission failures will be hard

**File:** `apps/web/src/features/pronunciation/MicCapture.tsx:55-63, 74-78`

The `error` Status falls back to `errorMsg` only — there's no `console.warn`, no telemetry hook, no log forwarding. Phase-6 PWA monitoring will need to add a hook here so we can see the distribution of "permission denied" vs "no device" vs "browser refused" errors in the field. Not a v1 bug; flagging so the future PWA-telemetry request knows to wire here.

### I-3 — `usePronunciationSession` returns `pendingResult` on a re-entrant submit, but the contract is undocumented

**File:** `apps/web/src/features/pronunciation/usePronunciationSession.ts:111-114`

```ts
if (submittingRef.current) {
  if (pendingResult) return pendingResult;
  throw new Error('submission already in flight');
}
```

The first concurrent call sets `submittingRef = true` and proceeds; the second concurrent call finds the ref `true` and either returns `pendingResult` or throws. But `pendingResult` is `null` until the *first* call resolves — so the second call within the same microtask race will throw, while a second call after the first set `pendingResult` returns it. That's two different observable behaviors for the same input pattern. Probably not a user-visible issue (the page guards via its own `submitting` boolean), but worth documenting in a JSDoc on `submitRecording`.

### I-4 — `MicCapture`'s `useEffect` cleanup may double-cancel a stopped recording

**File:** `apps/web/src/features/pronunciation/MicCapture.tsx:33-37`

```ts
useEffect(() => {
  return () => {
    if (handle) platform.cancelRecording(handle);
  };
}, [handle]);
```

When the user clicks Stop, `handleStop` calls `setHandle(null)` *before* the recorder finishes (the blob is delivered via `onstop`). The cleanup function for the *previous* handle (when handle was non-null) runs, calling `cancelRecording` on a recorder whose `state === 'inactive'`. The web adapter's implementation is idempotent here (state guard at `web.ts:185`), so this is fine. Worth a test (T-5 in the test-audit) and a code comment.

## Reproduction-friendly summary

| Finding | Repro                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| W-1     | None today (UUIDs); future-proof: change user.id to a non-UUID prefix-collision-prone format.               |
| W-2     | iOS Safari, `MicCapture` recorded, click Listen back outside a user gesture — button hangs.                  |
| W-3     | Click Record, navigate away during `'requesting'` — mic LED stays on until reload.                          |
| W-4     | Open card detail, run retention purge, click Play within 5min — silent failure (or stale success today).    |
| W-5     | POST `score-pronunciation` in a loop with a valid JWT — uncapped Whisper cost per attacker.                 |

## Fix-request files generated

- `requests/phase-4-fixes/fix-bug-path-prefix-segment-equality.md` (W-1)
- `requests/phase-4-fixes/fix-bug-play-recorded-audio-rejection.md` (W-2)
- `requests/phase-4-fixes/fix-bug-mic-capture-unmount-leak.md` (W-3)
- `requests/phase-4-fixes/fix-bug-pronunciation-history-stale-cache.md` (W-4)
- `requests/phase-4-fixes/fix-bug-server-side-audio-size-cap.md` (W-5)

I-tier are report-only.

## Blocking

**No Critical findings. Phase 4 is mergeable by BugHunt's gate.**

The 5 Warnings include one (W-5) that the brief explicitly pre-deferred to Phase 5; that's not a regression. The remaining 4 (W-1 through W-4) are all <2-day fixes and would be cheap to land before merging — recommend cherry-picking W-2 and W-3 specifically since they're real iOS Safari bugs that affect Ben's beta-test device, and W-1 because it's a 2-line drop-in defensive improvement. W-4 can wait until DEBT-005 activates.
