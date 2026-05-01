# Optimize — Phase 5

Per-row cost, redundant queries, network round-trips, and bundle-size impact for the Phase-5 surface.

## Summary

| Severity   | Count |
| ---------- | ----- |
| Critical   | 0     |
| High       | 0     |
| Medium     | 3     |
| Low        | 2     |

## Medium

### Medium-1 — Dashboard fetches `profiles` twice on every mount

**File:** `apps/web/src/features/dashboard/Dashboard.tsx:17-37`

`useProfile()` (line 17) loads the full `profiles` row. The `useQuery(['dashboard', user.id])` body (lines 24-27) issues a *second* `from('profiles').select('display_name')` against the same row, plus the `user_languages` query. The second profiles read is redundant — `useProfile().profile.display_name` already has it.

Quick fix: drop the `profiles` half of the dashboard `Promise.all` and read `display_name` from `useProfile()`. This collapses the dashboard's mount to one Postgres round-trip (the `user_languages` query) instead of two.

Bonus: `Dashboard` and `Header` both call `useProfile()`. TanStack Query dedupes within a render, so this is a wash — but the second `profiles` query in the dashboard body is a true duplicate.

→ Fix request: `requests/phase-5-fixes/fix-optimize-dashboard-duplicate-profile-fetch.md`

### Medium-2 — `getRecentWeakWords` over-fetches and post-filters in JS

**File:** `supabase/functions/generate-lesson/index.ts:64-87`

```ts
const { data, error } = await serviceClient
  .from('comprehension_attempts')
  .select('cards!inner(target_text, language_code), correct, created_at')
  .eq('user_id', userId)
  .eq('correct', false)
  .order('created_at', { ascending: false })
  .limit(limit * 2);
…
for (const row of data as unknown as Joined[]) {
  if (row.cards.language_code !== languageCode) continue;
  if (seen.has(row.cards.target_text)) continue;
```

The `cards!inner(…)` is one round trip — that part's fine. But:
1. `limit * 2 = 100` rows pulled, then language-filtered + deduped in JS. For a user with mostly different-language history, the first 100 rows can yield zero weak words. Filter language inside the SQL: `.eq('cards.language_code', languageCode)` (Supabase honors filter-on-joined-table when the join is `!inner`).
2. Dedup by target_text in SQL via `select distinct` or a CTE; today's JS Set-based dedup keeps `n×row_size` strings in memory.

Combined: bring the round trip down to ~`limit` rows actually used. For a Pro user generating 5 lessons/day, this is 5× a meaningful saving in egress + Edge Function memory.

(Also a correctness concern — see bughunt Medium-1.)

→ Bundled with the bughunt fix request: `requests/phase-5-fixes/fix-bug-weak-words-source-coverage.md`

### Medium-3 — Bundle-size impact: `zod` is now a direct shared dep + new generate UI surface

**Files:** `packages/shared/package.json`, `references/architecture.md` Dependency log

Phase 5 promotes `zod` from transitive to a direct dep of `@repeaty/shared` (architecture.md row in the dependency log confirms). `zod` was already in `apps/web`'s tree (architecture.md lists it from kickoff at `^3.23.8`). The promotion adds zero shipped bytes; just a new explicit row.

The new client surface added this phase:
- `features/admin/` (AdminGuard + AdminPage + useAdminTierFlip)
- `features/generate/` (GenerateLessonPage + useGenerateLesson)
- `features/auth/useProfile.ts`

These import shadcn primitives the app already ships and TanStack Query / react-router-dom already in tree. No new runtime deps. The architecture's `< 500KB gzipped` budget is unmoved by this phase. Suggest verifying once with `vite build` and a `du -sh` before merging.

(Adding this as a Medium because the bundle-size watch is part of the phase-5 audit emphasis — the actual delta should be minimal but it's worth confirming before the Phase-6 PWA-launch budget squeeze.)

→ Fix request: `requests/phase-5-fixes/fix-optimize-confirm-bundle-budget.md`

## Low

### Low-1 — Cache-hit branch in `generate-feedback` skips the rate-limit bump (correct) but not the ratelimit *check*

**File:** `supabase/functions/generate-feedback/handler.ts:224-239`

Cache hits short-circuit the bump — that's correct (cache hits are free). A potential abuse vector: a user can grind through `attempt_id`s for cards with cached feedback patterns and never tick the rate limit. In v1 this isn't exploitable (the user has to *generate* attempts first, which costs Whisper calls or comprehension submissions, both are rate-limit-adjacent). Phase 6 could add a separate `feedback_view` rate limit if hot-cache abuse becomes a real pattern.

Documentation only — no fix needed in v1.

### Low-2 — Edge Function logging emits one structured line per call but `cost_estimate_usd` is `null` on error paths

**Files:** `supabase/functions/generate-feedback/handler.ts:362-372`, `supabase/functions/generate-lesson/handler.ts:283-294`

On 4xx paths (auth, validation, rate limit, parse failure) the log line carries `cost_estimate_usd: null`. The Anthropic call may have run partway and burned input tokens before the parse failed — that cost is real but unlogged. Worth tracking in the log even when the user-facing response is an error, so the eventual cost dashboard reflects spent dollars rather than just billed-to-user-success dollars.

Defer until the cost dashboard exists (Phase 6 polish).
