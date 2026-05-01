# DriftAudit — Phase 4 (Pronunciation Mode)

Mode: quick. Scope: `references/*.md` vs files modified between `main` and `phase-4-pronunciation` HEAD (48 files, 14 commits).

## Per-file Pass/Fail

| File                                         | Verdict | Notes                                                                                            |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `references/schema.md`                       | **Fail**| (a) `Storage retention` block at line 121 says the job "deletes `pronunciation-audio/${user_id}/...` files older than 7 days" — but per migration 0013, the actual `purge_free_tier_audio()` body only NULLs the path; file deletion is deferred via DEBT-005. The doc claim is now false in production. (b) The `audio_storage_path` row entry is correctly noted as "Nullable: NULLed by the retention job…" — that part matches 0014. (c) The retention block doesn't reference DEBT-005 the way `profiles.tier` references DEBT-001 (line 31). |
| `references/architecture.md`                 | **Pass**| Phase-3 patches landed (algorithm-helper expansion, ADR-007 amendment). Phase 4 added zero client-side deps and the Edge Function deps live in `supabase/functions/deno.json`, not `apps/web/package.json`. The dep-log convention is silent on Deno-side deps; that's a kickoff-level decision, not Phase-4 drift. |
| `references/api-contracts.md`                | **Fail**| (a) The error-code enum at line 31 lacks a path-traversal-specific code. The handler uses `FORBIDDEN_TIER` for path-prefix violations (`handler.ts:144`); the doc defines `FORBIDDEN_TIER` as "Authenticated but not authorized (e.g. free user hitting Pro fn)" (line 24). The handler's test acknowledges the mismatch in a comment. Either rename / add a code, or update the doc to be explicit that `FORBIDDEN_TIER` covers any 403 use. (b) The Logging contract example at line 161-174 includes `cost_estimate_usd`, but the production log line in `handler.ts:240-246` omits it. score-pronunciation pays a real per-call OpenAI cost — the field should be populated, not skipped. |
| `references/env-vars.md`                     | **Fail**| The Edge Function reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY` from `Deno.env` via `validateEnv` (`index.ts:13-18`). The doc lists `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY`, but does not call out that **`SUPABASE_URL`** and **`SUPABASE_ANON_KEY`** are *also* required server-side — the doc's "Server-only" table omits them, the implication being only the `VITE_*` versions matter. In practice the Edge Function won't boot without them, and any `/pre-deploy` validator that mirrors this doc would miss two required server vars. |
| `references/repeaty-pwa.md`                  | **Pass**| The `PlatformAdapter` interface listing (lines 31-56) matches `apps/web/src/platform/types.ts` byte-for-byte: `playTargetText`, `cancelSpeech`, `canSpeak`, `canRecord`, `requestMicPermission`, `startRecording`, `stopRecording`, `cancelRecording`, `playRecordedAudio`. The "live in 4.1" note (line 40, 46) is set. iOS Safari quirks section is the canonical source — code matches. |
| `references/deployment-landmines.md`         | **Fail**| The "Storage retention is policy-driven" line (cited per BugHunt I-3 in earlier phases) does NOT mention DEBT-005 nor that the v1 retention job is "metadata-only" — files stay in storage. A future deploy reading this doc will assume audio expiry works end-to-end. The doc should call this out *or* point to DEBT-005's activation plan. |
| `references/security-landmines.md`           | **Pass**| The "Storage path prefix policies" section accurately describes `(SELECT auth.uid())::text = (storage.foldername(name))[1]`. The "Required helpers" section's `isInsideBaseDir` is still spec-only (handler.ts uses an inline `startsWith` check — see BugHunt W-1, which recommends a segment-equality helper). Spec-vs-impl: the doc is honest that the helpers are forward-looking spec, so this isn't drift, just a TODO marker. |
| `audits/debt.md` cross-references            | **Pass**| DEBT-005 is added with a concrete activation plan, references migration 0013 as its reversal pointer, and is cited from the migration's header comment. Format consistent with DEBT-001..004. |
| Edge errors enum (Node + Deno mirror)        | **Pass**| `packages/shared/src/edge-errors.ts` and `supabase/functions/_shared/edge-errors.ts` are byte-identical on `EDGE_ERROR_CODES` and `EDGE_ERROR_HTTP_STATUS`. The Deno copy's header comment correctly names the Node copy as the source of truth and notes drift-audit's job. |

## Specific divergences

### schema.md (Fail)

#### 1. Storage retention block contradicts migration 0013

**Doc:** `references/schema.md:121`:
> Daily pg_cron job `audio-retention-daily` (03:00 UTC) calls `purge_free_tier_audio()` **which deletes `pronunciation-audio/${user_id}/...` files** older than 7 days for `tier='free'` users and NULLs the `pronunciation_attempts.audio_storage_path` for those rows.

**Code:** `supabase/migrations/0013_audio_retention_path_only.sql:14-39` removed the `DELETE FROM storage.objects` from `purge_free_tier_audio()`. The function now *only* NULLs `audio_storage_path`. The file blob stays in `storage.objects` indefinitely until DEBT-005 activates.

This is **docs-ahead-of-code** — the dangerous direction. A reader assumes the privacy property "after 7 days, free-tier audio is gone from disk" holds, when in fact only the row's pointer is gone. For the friend's beta, this is a footnote; for any future "we delete your audio after 7 days" claim, it's a false statement.

**Recommended doc patch:**
```markdown
**Storage retention:** Daily pg_cron job `audio-retention-daily` (03:00 UTC) calls
`purge_free_tier_audio()` which NULLs `pronunciation_attempts.audio_storage_path`
for free-tier rows older than 7 days, hiding the audio from the UI's history view.
The underlying file blob in `storage.objects` is **not** removed in v1 — Supabase
blocks direct `DELETE FROM storage.objects` from any role. End-to-end file-blob
cleanup lands when [DEBT-005](../audits/debt.md) activates (Edge Function calling
the Storage HTTP API). Pro/admin audio is preserved indefinitely. Implemented in
0012; pruned to path-only in 0013; column nullability in 0014.
```

### api-contracts.md (Fail)

#### 1. No error code for path-traversal / cross-resource denial

**Doc:** `references/api-contracts.md:31`:
```
INVALID_PAYLOAD | UNAUTHENTICATED | FORBIDDEN_TIER | NOT_FOUND |
RATE_LIMITED | UPSTREAM_TIMEOUT | UPSTREAM_FAILED | INTERNAL
```
(line 24): `403 — Authenticated but not authorized (e.g. free user hitting Pro fn)`

**Code:** `supabase/functions/score-pronunciation/handler.ts:137-148` returns `FORBIDDEN_TIER` (HTTP 403) when `audio_storage_path` does not start with the caller's user_id. This is a path-traversal denial, not a tier denial. The code is misleading — Phase-5 callers will read `FORBIDDEN_TIER` and infer "user needs to upgrade".

The handler test acknowledges the mismatch: `"FORBIDDEN_TIER is the closest semantic match in the shared enum even though this is path-traversal, not tier — handler maps to it deliberately"` (handler.test.ts:120-122). That's a code smell calling for a proper code.

**Two paths:**

- **Add `FORBIDDEN_RESOURCE`** to the shared enum, mapped to 403, used for cross-resource denial. 5-line change to `packages/shared/src/edge-errors.ts` + `supabase/functions/_shared/edge-errors.ts` + handler.ts + handler.test.ts + this doc.
- **Document `FORBIDDEN_TIER` as the generic 403 code** and rename the doc text to "Authenticated but not authorized to perform this action (tier OR resource)". Less invasive but blurs the contract.

Recommend Path A — concrete codes are easier for downstream callers to branch on. Tracked as a fix-request below.

#### 2. Logging contract advertises `cost_estimate_usd`; handler omits it

**Doc:** `references/api-contracts.md:161-174` shows the canonical log line:
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

**Code:** `supabase/functions/score-pronunciation/handler.ts:240-246` logs:
```ts
deps.log({
  fn: 'score-pronunciation',
  request_id: args.requestId,
  user_id: args.userId,
  status: args.result.status,
  latency_ms,
});
```

`cost_estimate_usd` is never emitted. Whisper's per-call cost is straightforwardly derivable from audio duration (~$0.006/min ≈ $0.0001/sec → blob size × 1 byte/ms approximation), so this is a small TODO, not a redesign. The deployment-landmines doc says "Cost-per-call logging. Every Edge Function logs `cost_estimate_usd` in its structured log. Build a dashboard query later; don't try to add it after the bill is unexpected." — Phase 4 missed this for v1 and will miss it for `generate-lesson` / `generate-feedback` if not fixed.

**Recommended:** add a `cost_estimate_usd` field to the log line, computed from `audio.size` (rough heuristic) or skipped (`null`) on error paths. The doc says "every Edge Function logs"; the handler should match.

### env-vars.md (Fail)

#### 1. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are required server-side but listed as client-only

**Doc:** `references/env-vars.md` separates "Client-exposed (browser bundle, build-time)" (table at lines 8-14) from "Server-only (Edge Functions / local Supabase CLI)" (table at lines 18-23). The client table lists `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (correct — those are baked at build time). The server table lists only `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

**Code:** `supabase/functions/score-pronunciation/index.ts:13-18`:
```ts
const env = validateEnv({
  SUPABASE_URL: { required: true },
  SUPABASE_ANON_KEY: { required: true },
  SUPABASE_SERVICE_ROLE_KEY: { required: true },
  OPENAI_API_KEY: { required: true, prefix: 'sk-' },
});
```

The Edge Function reads **`SUPABASE_URL`** (not `VITE_*`) and **`SUPABASE_ANON_KEY`** (not `VITE_*`) from `Deno.env`. The function won't boot without them. Locally, Supabase's CLI auto-injects `SUPABASE_URL` and `SUPABASE_ANON_KEY` into the function runtime; in cloud, Supabase's Edge Function runtime auto-injects them. So there's no missing-secret issue in practice, but the doc is misleading: a contributor wiring `/pre-deploy` validation against `references/env-vars.md` would build a checklist that misses these two server-side requirements.

**Recommended doc patch:** add a row to the server-only table noting these two are auto-injected by Supabase but still required at function boot:

```markdown
| `SUPABASE_URL`               | Supabase project URL — server-side mirror of `VITE_SUPABASE_URL` | Edge Functions  | Auto-injected by Supabase's Edge runtime; do not set manually |
| `SUPABASE_ANON_KEY`          | Supabase anon JWT — server-side mirror used to construct user-context clients | Edge Functions | Auto-injected by Supabase's Edge runtime; do not set manually |
```

This makes the runtime-injected variables visible to anyone reading the doc, without falsely implying they need to be set.

### deployment-landmines.md (Fail)

#### 1. Audio retention is described as end-to-end but is metadata-only in v1

**Doc:** `references/deployment-landmines.md` (Supabase section): *"Storage retention is policy-driven. Audio files don't auto-expire. Wire a Postgres cron job (Supabase pg_cron) or a daily Edge Function to delete files older than 7 days for free-tier users."*

**Code:** as of migration 0013, the cron job *does not* delete files. The doc's recommendation is documented as "wire X to delete", but the actual wiring went the other way (DEBT-005 captures the deferred file-blob delete).

**Recommended doc patch:**
```markdown
- **Storage retention is policy-driven.** Audio files don't auto-expire. v1 wires a
  Postgres cron job (`audio-retention-daily`, 0011-0013) that NULLs
  `pronunciation_attempts.audio_storage_path` for stale free-tier rows — the
  user-facing privacy property holds (no row references the audio). The
  underlying file blob removal is deferred per [DEBT-005](../audits/debt.md);
  Supabase blocks direct `DELETE FROM storage.objects` so end-to-end cleanup
  needs an Edge Function calling the Storage HTTP API.
```

## Updates applied to references in this audit run

Per the skill spec, "If docs drifted from code: update the reference files directly in this audit run."

Three drifts above are **docs-against-code in the dangerous direction** (`schema.md` claims "deletes files" — false; `api-contracts.md` advertises `cost_estimate_usd` logging — not implemented). The skill says to update the docs to match, not silently rewrite without sign-off when code is the issue. Two cases:

- **Schema.md retention block** — code is correct (DEBT-005 deferred deliberately); doc is wrong about file deletion. **Patch the doc.** Done in this audit.
- **api-contracts.md cost_estimate_usd** — code is wrong (handler should log this); doc is correct. **Don't patch the doc; ship a fix-request.** Done.
- **api-contracts.md FORBIDDEN_TIER for path-traversal** — both could be right (extend enum, or broaden doc). **Ship a fix-request, let the user decide.** Done.
- **env-vars.md missing server-side SUPABASE_URL/ANON_KEY** — code is correct (Supabase auto-injects), doc is incomplete. **Patch the doc.** Done.
- **deployment-landmines.md retention claim** — code is correct (DEBT-005); doc overstates what v1 does. **Patch the doc.** Done.
- **schema.md DEBT-005 cross-link** — pure addition, no contradiction. **Patch the doc.** Done.

### `references/schema.md` — retention block patch

Replaced the "Storage retention" block under `pronunciation_attempts` (line 121) with the DEBT-005-aware version above.

### `references/env-vars.md` — server-side auto-injected vars

Added two rows to the server-only table noting Supabase's auto-injection of `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

### `references/deployment-landmines.md` — Storage retention bullet

Replaced the "Storage retention is policy-driven" bullet with the v1-accurate version that links DEBT-005.

(All three patches are applied as separate edits below by this audit run, per the skill's "update reference files directly" rule for docs-behind-code drift.)

## Issues that need code-side fix (not silent doc rewrite)

Two:

### 1. `score-pronunciation` should log `cost_estimate_usd`

`handler.ts` should compute a Whisper cost estimate from the audio Blob's `size` (or duration if exposed by the codec) and include it in the log line. Even a coarse `audio.size * 1e-9` placeholder is better than absent — it surfaces the field for downstream dashboards. Fix-request below.

### 2. The `FORBIDDEN_TIER` code should not double-duty as path-traversal denial

Either add `FORBIDDEN_RESOURCE` (preferred) or relax the doc's `FORBIDDEN_TIER` definition. Two-file change in either direction. Fix-request below.

## Fix-request files generated

- `requests/phase-4-fixes/fix-drift-cost-estimate-logging.md` (api-contracts.md vs handler.ts)
- `requests/phase-4-fixes/fix-drift-forbidden-resource-code.md` (api-contracts.md vs handler.ts on path-traversal denial)

## Blocking findings

**`schema.md` — Fail (now patched in this run).** Critical-path doc.
**`api-contracts.md` — Fail.** Non-blocking per the skill rule (only `schema.md` and `architecture.md` block).
**`architecture.md` — Pass.** Critical-path doc.

Per the skill's blocking rule, "Fail on `schema.md` or `architecture.md` blocks the next phase." `schema.md` is Fail in this audit. The drift is docs-ahead-of-code (the dangerous direction) and has been patched in place by this audit run. After the patch lands, `schema.md` is at Pass. Phase 4 is **mergeable** by DriftAudit's gate after the patches are committed.
