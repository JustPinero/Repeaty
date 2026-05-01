# Fix — `score-pronunciation` should log `cost_estimate_usd` per the api-contracts logging contract

**Source audit:** DriftAudit Phase 4 (api-contracts.md vs handler.ts)
**Severity:** Warning — non-blocking, but the doc-vs-code drift will compound when Phase-5 Edge Functions ship

## Problem

`references/api-contracts.md:161-174` (Logging contract) shows the canonical log line:

```json
{
  "fn": "score-pronunciation",
  "user_id": "uuid",
  "latency_ms": 842,
  "status": 200,
  "cost_estimate_usd": 0.006,
  "request_id": "uuid-v4"
}
```

`supabase/functions/score-pronunciation/handler.ts:240-246` actually logs:

```ts
deps.log({
  fn: 'score-pronunciation',
  request_id: args.requestId,
  user_id: args.userId,
  status: args.result.status,
  latency_ms,
});
```

`cost_estimate_usd` is never emitted. The deployment-landmines doc says "Cost-per-call logging. Every Edge Function logs `cost_estimate_usd`" — the handler missed this contract for v1.

## Why it matters

- Phase 5's `generate-lesson` and `generate-feedback` Edge Functions will be far more expensive per call than Whisper. If `cost_estimate_usd` isn't a habit from day one, the dashboard query that's "going to be built later" will be missing fields when it lands.
- The doc says "every Edge Function". `score-pronunciation` is the first Edge Function. If it doesn't log the field, the precedent is set.

## Proposed fix

Add a `costEstimateUsd` calculation to `handler.ts`. A coarse approximation from blob size: `audio.size / 1_000_000 * 0.006` (rough cost per MB at Whisper's $0.006/min and ~10s/MB opus). Expose it through the dep contract so production wiring computes it properly.

Sketch:

```ts
// handler.ts — extend HandlerDeps
export type HandlerDeps = {
  // ... existing
  estimateWhisperCostUsd?(audioSize: number): number;
};

// In createHandler, inside the success path:
const costEstimateUsd =
  deps.estimateWhisperCostUsd?.(audio.size) ?? null;

return finalize({
  ...,
  costEstimateUsd,
  result: jsonSuccess(...),
});

// In finalize:
function finalize(args: { ..., costEstimateUsd?: number | null }): Response {
  args.deps.log({
    fn: 'score-pronunciation',
    request_id: args.requestId,
    user_id: args.userId,
    status: args.result.status,
    latency_ms,
    cost_estimate_usd: args.costEstimateUsd ?? null,
  });
  return args.result;
}
```

In `index.ts`, wire the production estimator:

```ts
// Whisper: $0.006/min ≈ 0.006 / 60 / 1024 USD per (16kbps mono opus) byte ≈ ~6.5e-9 USD/byte.
// Coarser approx via size-as-proxy-for-duration: at 64kbps opus that's ~0.0001 USD/sec.
estimateWhisperCostUsd(audioSize: number) {
  // 0.006 USD per 60 seconds; opus at 64kbps ≈ 8KB/sec → audioSize/8192 = seconds.
  const seconds = audioSize / 8192;
  return Number((seconds * 0.006 / 60).toFixed(6));
}
```

The exact formula matters less than logging *something*. Update the api-contracts.md if a `cost_estimate_usd: null` on error paths should be the contract.

## Test

Update `handler.test.ts`'s happy-path test to assert `cost_estimate_usd` is present in the log line. Pass an `estimateWhisperCostUsd: (size: number) => 0.0042` stub via deps:

```ts
const deps = happyDeps({
  estimateWhisperCostUsd: (size: number) => 0.0042,
});
// ... after the request runs:
const logLine = deps.__logs[0] as Record<string, unknown>;
assertEquals(logLine.cost_estimate_usd, 0.0042);
```

## Files to touch

- `supabase/functions/score-pronunciation/handler.ts` — extend deps + log.
- `supabase/functions/score-pronunciation/index.ts` — implement `estimateWhisperCostUsd`.
- `supabase/functions/score-pronunciation/handler.test.ts` — extend happy-path test.

## Acceptance criteria

- [ ] Every successful invocation logs a numeric `cost_estimate_usd`.
- [ ] Error paths log `cost_estimate_usd: null` (or omit the field — pick one and document in api-contracts.md).
- [ ] Tests assert the field is present on the happy path.
