# Fix — `stripFence` is duplicated between `feedback-prompt.ts` and `lesson-prompt.ts`

**Severity:** Low. Bughunt Phase-5 Low-2.

## Root cause

`packages/shared/src/feedback-prompt.ts:100-105` and `packages/shared/src/lesson-prompt.ts:92-97` both define a local `stripFence(s: string)` with bit-identical implementations. The lesson-prompt copy explains the duplication ("Local copy of the fence stripper… so Deno's strict TS resolution doesn't have to traverse an extra relative path at type-check time").

Risk: if either copy diverges, a Claude response that wraps output unusually could pass one strip and fail the other, surfacing as `UPSTREAM_FAILED` in only one function. Net: divergence is silent until you eyeball both impls.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | A single `stripFence` lives in either `packages/shared/src/strip-fence.ts` or stays in `feedback-prompt.ts` as the canonical source. |
| 2 | `lesson-prompt.ts` imports from the canonical source. |
| 3 | The canonical export is re-exported from `packages/shared/src/index.ts` (already true for the feedback-prompt copy). |
| 4 | The Deno traversal concern is verified empirically — `pnpm --filter @repeaty/shared typecheck` and a Deno typecheck of `generate-lesson/handler.ts` both stay green. |

## Files to touch

- `packages/shared/src/strip-fence.ts` (NEW — if extracted) OR keep in `feedback-prompt.ts`
- `packages/shared/src/lesson-prompt.ts`
- `packages/shared/src/index.ts` (only if path changes)

## Out of scope

Other duplication between the two prompt modules (the system-prompt skeleton is functionally similar but actually carries different instructions per use case — leave alone).
