# Optimize — Phase 4 (Pronunciation Mode)

Mode: quick. Scope: 48 files modified between `main` and `phase-4-pronunciation` HEAD (14 commits).

## Summary
- **High:** 0
- **Medium:** 4
- **Low:** 4

The phase ships clean on bundle hygiene — no new client deps, no full-library imports, no shadcn-wholesale grabs. The new pronunciation feature is a leaf-route component that adds ~6KB gz to the bundle (MicCapture + storage helper + hook + page + history component, all small and tree-shakeable). The Edge Function uses `npm:` specifiers for zod and supabase-js (per `supabase/functions/deno.json`), and the handler factory pattern keeps the production `index.ts` to 102 lines — cold-start cost is dominated by `supabase-js` import (~30ms), which is unavoidable for Whisper proxy work.

The new SQL paths are well-indexed: `pronunciation_attempts` reads via `idx_pron_user_card_created (user_id, card_id, created_at desc)` (existing from migration 0005) — exactly matches the history component's query shape. The retention job is a single pass over the table; no N+1.

The 4 Mediums are: (1) `usePronunciationSession.test`'s `submitRecording` issues two sequential round-trips (Storage upload, then Edge Function invoke) — fine for v1 latency budget but a gentle round-trip optimization candidate; (2) `CardPronunciationHistory` paginates via growing `limit` (carry-forward of Phase-3 M-1, same fix); (3) the route table still eagerly imports `PronunciationSessionPage` + `CardDetailPage` (Phase-3 M-2 unchanged — neither was lazy-split); (4) `usePronunciationSession.submitRecording`'s `useCallback` dep array includes `pendingResult` (so it re-binds on every result), which prevents a future memoized child from honoring callback identity (Phase-3 M-4 carry-forward).

## High
None.

## Medium

### M-1 — `submitRecording` makes two sequential round-trips per attempt

**File:** `apps/web/src/features/pronunciation/usePronunciationSession.ts:107-148`

```ts
const path = await uploadPronunciationBlob(blob, { userId, cardId: currentCard.id });
const invoked = await supabase.functions.invoke<EdgeResponse>('score-pronunciation', {
  body: { card_id: currentCard.id, audio_storage_path: path },
});
```

Two serial network round-trips per recording: (1) PUT to Storage (~200-800ms on cellular for ~200KB blob), (2) POST to Edge Function (~600-2000ms including Whisper). User-perceived latency is the sum (~1-3 seconds) before the result panel appears.

Two paths to collapse to one round-trip:

**Path A (preferred for v1):** keep upload as a separate trip but parallelize speculatively — start the Edge Function call as soon as the upload begins and the path is computable client-side (the path is deterministic given userId + cardId + a pre-generated UUID). Risk: the Edge Function might receive `audio_storage_path` before the file lands. Mitigation: the function already has retry logic on `downloadAudio` returning null (`UPSTREAM_FAILED`, but only after a single attempt — would need a small polling loop, 3×500ms). Net: ~30-50% latency win.

**Path B (longer-term, Phase 5 territory):** change `score-pronunciation` to accept a multipart upload (audio in the body, not a path reference). Eliminates the Storage intermediary entirely from the *hot path* — the Edge Function uploads to Storage *after* a successful Whisper call. Cleaner cost-attribution (no orphaned Storage objects from failed Whisper attempts). Bigger refactor — explicitly out-of-scope for Phase 4 per the request file.

**Estimated impact:** Path A drops user-perceived latency by ~300-800ms on cellular. Path B drops it by another ~200-500ms. Combined, halves the wait between Stop click and result display.

For v1, the 1-3s latency is acceptable (the user is reading the score, not racing it). Recommend logging this for Phase-6 PWA polish; don't act on it now.

### M-2 — `CardPronunciationHistory` paginates by re-fetching with growing `limit` instead of cursor (carry-forward of Phase-3 M-1)

**File:** `apps/web/src/features/pronunciation/CardPronunciationHistory.tsx:25, 28-42, 129-133`

```ts
const [limit, setLimit] = useState(pageSize);
// ...
.order('created_at', { ascending: false })
.limit(limit);
// ...
<Button onClick={() => setLimit((l) => l + pageSize)}>Load more</Button>
```

Identical pattern (and identical impact analysis) to `CardComprehensionHistory`. The Phase-3 audit recommended cursor-paginating via `lt('created_at', oldestSeen)`; that fix didn't land before Phase 4, and the new component copy-pasted the pattern.

**Estimated impact:** at 200 attempts/card with 10 Load-more clicks, drops fetched-bytes from ~21 pages × 20 rows × ~250 bytes/row (transcripts add bytes vs comprehension's response_ms) ≈ 105KB to 10 × 20 × 250 ≈ 50KB. Halves history-panel bytes, *plus* the same savings on the comprehension panel. Worth doing once for both — if you fix this, fix Phase-3 M-1 in the same commit.

### M-3 — `PronunciationSessionPage` and `CardDetailPage` are eagerly imported (carry-forward of Phase-3 M-2)

**File:** `apps/web/src/routes/index.tsx:11-12`

```ts
import { PronunciationSessionPage } from '@/features/pronunciation';
import CardDetailPage from '@/pages/CardDetail';
```

Phase 4 added two more route-leaf imports to the eagerly-loaded set. The dashboard now ships JS for review + comprehension + pronunciation + card-detail before the user has clicked anything. Estimated bundle cost for the new pages alone: ~7KB gz (`MicCapture` + `usePronunciationSession` + `PronunciationSessionPage` + `CardPronunciationHistory` + the deps not already loaded by review/comprehension).

`React.lazy` splits each route into its own chunk:

```tsx
const PronunciationSessionPage = React.lazy(() =>
  import('@/features/pronunciation').then((m) => ({ default: m.PronunciationSessionPage }))
);
// wrap the route element in <Suspense fallback={<Loading />}>
```

Same recipe for `CardDetailPage`, `ReviewSessionPage`, `ComprehensionSessionPage`. Phase-3 M-2 deferred this to Phase 6's PWA polish. Phase-4 added two more eager routes; the deferred work grew. Recommend landing all four lazy splits as one Phase-6 chore.

**Estimated impact:** ~15-25KB gz off the initial bundle (cumulative across four routes), + faster TTI on the dashboard.

### M-4 — `usePronunciationSession.submitRecording`'s `useCallback` re-binds on every result

**File:** `apps/web/src/features/pronunciation/usePronunciationSession.ts:107-147`

```ts
const submitRecording = useCallback(
  async (blob: Blob): Promise<PronunciationResult> => { /* ... */ },
  [currentCard, userId, pendingResult],   // ← pendingResult changes after every submit
);
```

`pendingResult` is in the dep list because the re-entrancy guard at line 112 reads it (`if (pendingResult) return pendingResult`). The result is that `submitRecording` gets a new identity after every successful submit. `MicCapture` doesn't memoize on `onRecorded` identity (it's wired through `handleRecorded` in the page, which itself re-binds), so this is invisible today — but it defeats memoization in any future component that *does* memoize on prop identity.

Same shape as Phase-3 M-4 on `useComprehensionSession`. Same fix: pull `pendingResult` access through a ref:

```ts
const pendingResultRef = useRef(pendingResult);
useEffect(() => { pendingResultRef.current = pendingResult; }, [pendingResult]);

const submitRecording = useCallback(
  async (blob: Blob): Promise<PronunciationResult> => {
    // ...
    if (submittingRef.current) {
      if (pendingResultRef.current) return pendingResultRef.current;
      throw new Error('submission already in flight');
    }
    // ...
  },
  [userId],   // ← stable per session
);
```

Pulls `currentCard` access through a ref too (same pattern as Phase-3 M-4 recommended for `useComprehensionSession`), reducing the dep array to just `[userId]`. Pairs with the test-audit T-1 (re-entrancy guard test) — same touch-points.

## Low

### L-1 — `MicCapture` recreates the `pickMimeType()` candidate list inside `web.ts` on every `startRecording` call

**File:** `apps/web/src/platform/web.ts:45-53`

```ts
function pickMimeType(): string | undefined {
  const Recorder = getMediaRecorderCtor();
  if (!Recorder?.isTypeSupported) return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) { ... }
}
```

Allocates a 3-string array on every call. Negligible — measured in nanoseconds. Don't optimize.

### L-2 — `usePronunciationSession` recomputes `averageScore` on every render

**File:** `apps/web/src/features/pronunciation/usePronunciationSession.ts:156-159`

```ts
const averageScore =
  results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;
```

`results` is at most ~30 items (deck size), so the reduce is O(30). Recomputed on every render, but the cost is microseconds. `useMemo` would save ~30 multiplications per render — irrelevant given React's render budget. Skip.

### L-3 — `CardPronunciationHistory.handlePlay` creates a fresh `<Audio>` element per click and never disposes the URL on `error` from `audio.play()` rejection

**File:** `apps/web/src/features/pronunciation/CardPronunciationHistory.tsx:44-65`

If the signed URL fetch succeeds, the `new Audio(...)` is created but `audio.play().catch(reject)` may reject without firing `onerror`. The `audio` element is then orphaned (no listeners attached after rejection). Same shape as `web.ts` W-2 from BugHunt; here the `try/finally` pattern with `setPlayingId(null)` keeps state consistent, but the object URL implicit in the `<audio>` is the browser's own caching — there's no `URL.revokeObjectURL` call here because the URL came from `createSignedUrl` (a Supabase signed URL, not an object URL). So this is *fine* — different mechanism than web.ts:201 — but worth noting for future audit clarity.

### L-4 — `score-pronunciation` reads the entire audio Blob into memory before sending to Whisper

**File:** `supabase/functions/score-pronunciation/index.ts:49-78`

```ts
async downloadAudio(path: string) {
  const { data } = await serviceClient.storage.from('pronunciation-audio').download(path);
  return data;
},
async transcribeAudio({ audio, language, signal }) {
  const form = new FormData();
  form.append('file', audio, 'audio');
  // ...
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    body: form,
    signal,
  });
  // ...
}
```

The audio is fully buffered in the Edge Function's memory before being re-uploaded to OpenAI. With `MAX_AUDIO_BYTES = 10MB`, that's the worst case. Streaming `download()` directly into the FormData body would halve memory headroom — but Deno Deploy's per-function memory limit is 256MB and Whisper requests are sub-second-throughput, so this isn't a real bottleneck. Skip unless a future Phase-6 monitoring pass shows memory pressure.

## Bundle / cost notes

- **No new client dependencies** in `apps/web/package.json` for Phase 4. The diff vs main is only re-resolution of the existing tree. The Phase-3 audit's "Dependency log" called this out for Phase 3 too — the pattern continues.
- **Edge Function deps:** `supabase/functions/deno.json` adds `npm:zod@3.23.8`, `npm:@supabase/supabase-js@2.46.1`, and stdlib assert/server. All vendored on first `deno test` / `deno check`. Cold start: ~150ms (zod parse compilation + supabase-js import). Warm: ~5ms. Whisper round-trip dominates.
- **Storage cost:** at the 7-day free-tier retention + ~200KB per attempt + 30 cards/day per user, steady-state is ~42MB/user. Trivial on Supabase Storage's free tier (1GB) and cheap thereafter. Cost-per-Whisper-call is ~$0.003 at 30s opus (per OpenAI's $0.006/min). For Ben's beta usage, total monthly Whisper cost ≈ $1-3. No alarm bells.
- **Bundle delta:** ~6KB gz for the new pronunciation feature — `MicCapture` (~1.5KB), `usePronunciationSession` (~2KB), `PronunciationSessionPage` (~1KB), `CardPronunciationHistory` (~1.5KB), the storage helper (<0.5KB). All are leaf-route, all tree-shakable. The eager-import findings (M-3) mean the dashboard's initial bundle eats this even when the user never opens the pronunciation flow.
- **Edge Function bundle:** `score-pronunciation/index.ts` is 102 lines + the handler module. supabase-js dominates the cold-start cost. AbortController + 15s timeout matches the api-contracts.md spec.

## Top three improvements (ranked by impact)

1. **Cursor-paginate `CardPronunciationHistory` AND `CardComprehensionHistory` in one chore.** M-2 carries forward the unfixed Phase-3 finding. Doing them together saves a copy-paste pattern; the helper extracts cleanly.
2. **`React.lazy` the four route-leaf pages (Review, Comprehension, Pronunciation, CardDetail).** M-3 carries forward Phase-3 M-2 with an extra two pages now in the eager set. Bigger savings; same recipe. Land in Phase 6 alongside service-worker registration.
3. **Stabilize `submitRecording` identity via `pendingResultRef` + `currentCardRef`.** M-4 plus the same pattern to Phase-3's `useComprehensionSession`. One small refactor pays down debt in two hooks at once. Pairs with the re-entrancy test from test-audit T-1.

## Fix-request files generated

None — all findings are Medium or Low. Per the skill spec, only High items get fix-requests. Mediums live in this report only; the user decides if they become requests.

## Non-blocking

Optimize never blocks a phase. Phase 4 is clear from the perf axis.
