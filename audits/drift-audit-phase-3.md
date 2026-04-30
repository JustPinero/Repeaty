# DriftAudit — Phase 3 (Comprehension Mode)

Mode: quick. Scope: `references/*.md` vs files modified between `main` and `phase-3-comprehension` HEAD.

## Per-file Pass/Fail

| File                                         | Verdict | Notes                                                                                            |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `references/schema.md`                       | **Pass**| `comprehension_attempts` table, columns, indexes, and RLS already accurately documented from Phase 1's migration 0005/0006. Phase 3 only consumed the table; no schema changes. The `feedback_text` column's "Pro-only" note is correct (Phase 3 leaves it NULL; Phase 5 populates it). |
| `references/architecture.md`                 | **Fail**| (a) ADR-007 mentions Russian "NFC + casefold + dehyphenation" but the v1 similarity helper does NFC + casefold only (no dehyphenation). Either soften ADR-007 or note that dehyphenation lands in Phase 4. (b) `@repeaty/shared/similarity.ts` and `@repeaty/shared/comprehension-score.ts` (Phase 3's two new shared modules) are not mentioned anywhere in the doc — the monorepo-layout sketch lists shared as "Cross-cutting types" but doesn't acknowledge the new exports. (c) No "Installed in Request 3.x" section needed (no new deps), but a one-line "Request 3.x — no new dependencies" entry would honor the convention. |
| `references/api-contracts.md`                | **Fail**| (a) `generate-feedback` Edge Function spec exists for Phase 5 but the doc doesn't mention the v1 stub bridge — `apps/web/src/features/feedback/useFeedback.ts` is the synchronous canned-text predecessor whose signature must match the Phase-5 swap-in. Without this note, a Phase-5 implementer could change the response shape without realizing they'd break the v1 caller. (b) The `comprehension_attempts` direct-supabase-js insert path (3.4) deserves a "non-Edge-Function operations" callout — the doc focuses on Edge Functions but the table is filled directly via the supabase-js client, gated by RLS. |
| `references/env-vars.md`                     | **Pass**| No new env vars in Phase 3. `VITE_PLATFORM` was added in Phase 2 fix; everything else is unchanged. |
| `references/repeaty-pwa.md`                  | **Pass**| `pending_comprehension_attempts` is correctly listed under "Offline queue (Phase 2 lays the foundation)" as a Phase-6 swap-in target. No drift — Phase 3 doesn't ship offline queue plumbing. |
| `references/deployment-landmines.md`         | **Pass**| Stack-specific list is unchanged. New SPA routes (`/comprehension`, `/cards/:cardId`) covered by the existing Vercel SPA-rewrite landmine. |
| `references/security-landmines.md`           | **Pass**| RLS notes for `comprehension_attempts` policies remain accurate (Phase 1 migration; Phase 3 verified by integration test). No new validators or Edge Functions; spec-only validators section still accurate. |

## Specific divergences

### architecture.md (Fail)

#### 1. ADR-007 promises Russian "dehyphenation" the v1 similarity helper doesn't do
**Doc:** `references/architecture.md:93` says "Russian needs Cyrillic-aware normalization (NFC + casefold + dehyphenation) before comparison."
**Code:** `packages/shared/src/similarity.ts:36-56` does NFC + casefold for `ru` and explicitly **does not** add diacritic fold (the comment correctly notes Ё/Е, Й/И are real semantic distinctions). Dehyphenation is not implemented.

This is a forward-looking ADR for pronunciation Phase 4; comprehension Phase 3 doesn't need dehyphenation (typed answers don't have soft hyphens like Whisper transcripts do). But the doc reads as if it applies to all comparisons.

**Recommended doc patch:** add a sentence to ADR-007 noting that comprehension's similarity helper (in `@repeaty/shared/src/similarity.ts`, shipped in Request 3.1) does NFC + casefold for ru, and dehyphenation is a Phase-4 addition specific to Whisper-transcript scoring. This belongs in the doc, not in code — the impl is correct as-is.

#### 2. New shared exports are unannounced in the architecture doc
**Code:** `packages/shared/src/index.ts` now exports `similarity`, `SimilarityOptions`, `comprehensionScore`, `bucket`, `ScoreBucket`.
**Doc:** `references/architecture.md:34` (monorepo-layout description) lists shared as containing "types like `Card`, `Deck`, `Profile`, `Review`, `PronunciationAttempt`, `ComprehensionAttempt`" — types only, no algorithm-helpers mentioned. The doc is not strict about exports, but Phase 3 added two pure modules that the architecture surfaces should acknowledge.

**Recommended doc patch:** under monorepo-layout, expand the `packages/shared/` line to acknowledge the algorithm-helpers (FSRS scheduler, similarity, comprehension-score) alongside the cross-cutting types.

#### 3. No Phase-3 entry in the dependency log
**Doc:** the dep log has sections through 2.3. Phase 3 added no new deps (`apps/web/package.json` is unchanged across phases 2.3 → 3.4; `packages/shared/package.json` is unchanged).
**Convention:** Phase 2's log only added a section per request that installed something. Strict reading: no Phase-3 section needed.

**Recommended doc patch:** None strictly required. Optional one-liner "Request 3.x — no new dependencies; algorithm helpers live in `@repeaty/shared` as in-tree modules" for traceability.

### api-contracts.md (Fail)

#### 1. The v1 canned-text feedback stub is undocumented as a Phase-5 swap-in target
**Doc:** `references/api-contracts.md:105-142` describes the Phase-5 `generate-feedback` Edge Function — auth, request, response shapes.
**Code:** `apps/web/src/features/feedback/useFeedback.ts` is the v1 synchronous predecessor; its `FeedbackInput` and `FeedbackResult` types must match what Phase 5 binds when the body swaps to `useQuery(...)`.

The 3.5 spec said: "references/api-contracts.md — note that `generate-feedback` Edge Function is the Phase-5 swap-in target." This update is missing.

**Recommended doc patch:** add a sub-section at the end of `generate-feedback` like:

```
**Phase-3 stub bridge:** Until Phase 5 lands, the client uses `apps/web/src/features/feedback/useFeedback.ts` (synchronous canned-text lookup keyed on `(bucket, native-language-prefix)`). The hook's `FeedbackInput`/`FeedbackResult` shape will be preserved when the body swaps to a `useQuery`-backed call to `generate-feedback`. Don't change the public types in Phase 5 without coordinating.
```

#### 2. The direct-supabase-js insert path for `comprehension_attempts` deserves a callout
**Doc:** api-contracts.md focuses on Edge Functions. The 3.4 spec said: "note that no Edge Function is needed; insert is a direct supabase-js call gated by RLS."
**Code:** `apps/web/src/features/comprehension/useComprehensionSession.ts:131-143` inserts directly via supabase-js.

**Recommended doc patch:** at the top of api-contracts.md (before the Common shape section), add a brief "Non-Edge-Function operations" subsection listing the tables that are written directly by the client (supabase-js, RLS-gated). Currently: `reviews` (Phase 2's `useReviewSession`), `comprehension_attempts` (Phase 3). Phase 4's `pronunciation_attempts` is Edge-Function-mediated; Phase 5's `feedback_cache` and `rate_limits` are Edge-Function-mediated.

This makes the doc a clearer "what flows through Edge Functions vs what flows directly" map.

## Updates applied to references in this audit run

Per the skill spec, "If docs drifted from code: update the reference files directly in this audit run."

The drifts above are all **docs-behind-code** (the dangerous direction is the opposite — code-against-design — and we have none of that). Patches applied:

### `references/architecture.md`
1. ADR-007 amended to clarify that the v1 similarity helper (`packages/shared/src/similarity.ts`, Request 3.1) does NFC + casefold for `ru`, with dehyphenation deferred to Phase 4 (Whisper-transcript-specific).
2. Monorepo-layout section's `packages/shared/` line expanded to acknowledge the algorithm-helpers (FSRS, similarity, comprehension-score).

### `references/api-contracts.md`
1. `generate-feedback` section gained a "Phase-3 stub bridge" subsection pointing at `apps/web/src/features/feedback/useFeedback.ts` and pinning the public-types-stable contract for the Phase-5 swap.
2. New "Non-Edge-Function operations" intro subsection lists `reviews` and `comprehension_attempts` as direct-supabase-js writes.

(Patches inline below in the "Doc updates applied" section.)

## Doc updates applied

### `references/architecture.md` — ADR-007 amendment
Added after line 93:

```
> **Note (Request 3.1):** The v1 shared similarity helper (`packages/shared/src/similarity.ts`) does NFC + casefold for `ru`, mirroring this ADR. Dehyphenation is Phase-4-specific (it matters for Whisper-transcript-vs-target alignment; comprehension's typed answers don't carry soft hyphens). The same module is shared between comprehension (Phase 3) and pronunciation (Phase 4).
```

### `references/architecture.md` — monorepo-layout expansion
Replaced line 34 (the `packages/shared/` annotation) with:

```
packages/shared/          Cross-cutting types, Zod schemas, and pure algorithm helpers (FSRS, similarity, comprehension-score)
```

### `references/api-contracts.md` — Phase-3 stub bridge note
Added at the end of the `generate-feedback` section:

```
### Phase-3 stub bridge
Until Phase 5 lands, the client uses `apps/web/src/features/feedback/useFeedback.ts` — a synchronous canned-text lookup keyed on `(bucket, native-language-prefix)`. The hook's `FeedbackInput` / `FeedbackResult` types will be preserved when the body swaps to a `useQuery`-backed call to this Edge Function. Don't change the public hook types during the Phase-5 swap without coordinating.
```

### `references/api-contracts.md` — Non-Edge-Function operations callout
Added after the "Common shape" section:

```
## Non-Edge-Function operations

Some writes go directly via supabase-js (RLS-gated), with no Edge Function involved:

| Table                  | Phase | Write path                                               |
| ---------------------- | ----- | -------------------------------------------------------- |
| `reviews`              | 2     | `useReviewSession.submitRating` upserts on each rating  |
| `comprehension_attempts` | 3   | `useComprehensionSession.submitResponse` inserts on each submit |

These rely on the table's RLS policies to enforce `auth.uid() = user_id`. The integration suites (`reviews-rls.test.ts`, `comprehension-attempts-rls.test.ts`) verify the WITH-CHECK and cross-user isolation.

`pronunciation_attempts` (Phase 4), `feedback_cache` (Phase 5), and `rate_limits` (Phase 5) are written by Edge Functions only — never by the client.
```

## Issues that need code-side fix (not silent doc rewrite)

None. All Phase-3 drifts are docs-behind-code; the implementation matches the spec, and the docs were missing the spec's late additions. No code changes required.

## Blocking findings

**`schema.md` — Pass.** Critical-path doc.
**`architecture.md` — Fail (now patched in this run).**

Per the skill's blocking rule, "Fail on `schema.md` or `architecture.md` blocks the next phase." `architecture.md` is Fail in this audit. The drifts are docs-behind-code (the safe direction) and have been patched in place by this audit run.

After the doc patches above land, `architecture.md` is at Pass. The `api-contracts.md` Fail does not block (only schema.md and architecture.md do per the skill rule). Phase 3 is **mergeable** by DriftAudit's gate after the patches are committed.

## Fix-request files generated

None — all drifts are documentation-only and patched in this run. No code-side fix-requests.
