# Drift Audit — Phase 5

Doc-vs-code consistency check for the Phase-5 surface. Items marked **PATCHED** have been corrected in-place per the audit-gate brief; items marked **fix request** require code changes and are tracked under `requests/phase-5-fixes/`.

## Summary

| Severity   | Count | Of which patched |
| ---------- | ----- | ---------------- |
| Critical   | 0     | 0                |
| High       | 4     | 4                |
| Medium     | 2     | 0                |
| Low        | 2     | 0                |

## High (all patched in this audit)

### High-1 — `references/api-contracts.md` did not document `flip-tier` (PATCHED)

The Edge Function shipped in 5.2 (`supabase/functions/flip-tier/{index,handler}.ts`) had no entry in `references/api-contracts.md`. The doc opened with "Three Edge Functions"; with `flip-tier` it's four.

**Patched:**
- Updated lead from "Three" → "Four".
- Added a complete `## flip-tier (Phase 5, admin only)` section with auth, request shape, server-side flow, response shape, and the RPC-error-message → Edge-error-code mapping (`NOT_ADMIN → FORBIDDEN_TIER`, `SELF_FLIP_FORBIDDEN → FORBIDDEN_RESOURCE`, etc.).
- Documented the by-design admin-elevation permissiveness for v1.

### High-2 — `references/api-contracts.md` retained the obsolete "Phase-3 stub bridge" note (PATCHED)

5.4 swapped the body of `useFeedback` to call `generate-feedback`. The doc still warned readers that the canned-text path was in use "until Phase 5 lands". Misleads anyone reading the file at HEAD.

**Patched:**
- Replaced the "Phase-3 stub bridge" subsection with a concise "Phase 5.4 swap, landed" note that documents the additive `attemptId` field, preserved public types, and the canned-text demotion to fallback-only.

### High-3 — `references/schema.md` did not document `tier_change_log`, `flip_tier`, or `insert_ai_deck_with_cards` (PATCHED)

5.1 and 5.2 added `tier_change_log` and three new SECURITY DEFINER RPCs. Schema.md had `bump_rate_limit` listed inside `rate_limits` (well — as one paragraph in `Auxiliary`) but `feedback_cache` had no RPC notes; `flip_tier` and `insert_ai_deck_with_cards` were entirely absent.

**Patched:**
- Added a `tier_change_log` table section under `Auxiliary` (columns, indexes, RLS).
- Added a new `## RPCs (Phase 5)` section covering `bump_rate_limit`, `flip_tier`, `insert_ai_deck_with_cards`, with raise-codes and (critically) the **caller-context contract** — service-role clients cannot invoke these RPCs because `auth.uid()` resolves to NULL inside SECURITY DEFINER. This doc note also makes bughunt Critical-1 / Critical-2 obvious.
- Added pre-existing `complete_onboarding` and `due_cards_summary` cross-references.

### High-4 — `references/schema.md` Migrations naming list did not list `0015`, `0016`, `0017` (PATCHED)

The doc's Phase-N migrations log stopped at Phase 2. Phases 3 and 4 had landed without back-filling and Phase 5 added three more migrations. The list was at risk of being treated as authoritative by `/pre-deploy` or future drift checks.

**Patched:** added a `Phase 5 migrations:` section that lists 0015 / 0016 / 0017 with one-line descriptions. (Phase 3 + Phase 4 migrations are still missing from this log; that's pre-existing drift not addressed here.)

## Medium

### Medium-1 — `references/api-contracts.md` line 107 cites `response_format: { type: "json_object" }` for the Anthropic call

This is OpenAI-API-specific syntax; Anthropic's `/v1/messages` endpoint does not accept a `response_format` parameter. The actual code in `supabase/functions/generate-{feedback,lesson}/index.ts` correctly omits it and asks for JSON via the system prompt. The doc is misleading but the *behavior* is right.

The Phase-5 acceptance criteria for both 5.3 and 5.5 also use this OpenAI-flavored phrasing. The handler tests assert the strip-fence + JSON-parse path which is what actually matters.

→ Fix request: `requests/phase-5-fixes/fix-drift-anthropic-response-format-doc.md`

### Medium-2 — `references/architecture.md` Dependency log row for zod (5.3) is positioned out of phase order

The new row is inserted between Request 2.2 and Request 2.3 — hard to spot. Cosmetic; the row content is correct (zod 3.23.8 promoted from transitive to direct dep of `@repeaty/shared` per 5.3). Consider grouping new rows under a `### Installed in Phase 5` header in a follow-up.

→ Optional fix request: `requests/phase-5-fixes/fix-drift-architecture-deps-log-ordering.md`

## Low

### Low-1 — `e2e-manifest.json` flip for `pronunciation-session` (Phase-4 / DEBT-006) — confirmed

The manifest currently has `pronunciation-session.status = "in-progress"`. `audits/debt.md` § DEBT-006 documents the revert from `complete` → `in-progress` after a CI flake, with a four-step plan to reactivate. Cross-confirmed against the Phase-4 audit-deferred fixes that were landed in `chore(5.0)`. No drift — this is the documented state.

### Low-2 — Both copies of `_shared/edge-errors.ts` and `packages/shared/src/edge-errors.ts` carry `FORBIDDEN_RESOURCE`

Diffed `packages/shared/src/edge-errors.ts` vs `supabase/functions/_shared/edge-errors.ts`:

```
$ diff packages/shared/src/edge-errors.ts supabase/functions/_shared/edge-errors.ts
… (only doc-comment differences; the EDGE_ERROR_CODES list and EDGE_ERROR_HTTP_STATUS map are identical)
```

`FORBIDDEN_RESOURCE` is present in both copies after `chore(5.0)`. No drift. The duplication is documented in the file headers; future bumps must touch both files.

## Items confirmed in lockstep (no drift)

- `references/env-vars.md` already documents `ANTHROPIC_API_KEY` with `sk-ant-` prefix (added pre-Phase-5).
- `references/architecture.md`'s Dependency log carries the zod row for 5.3.
- The Phase-5 list in `references/architecture.md` § Phases (live build plan) reads correctly.
- `audits/debt.md` carries DEBT-001, DEBT-006 as expected and is not stale.
