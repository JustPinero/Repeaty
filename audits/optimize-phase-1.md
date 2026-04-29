# Optimize — Phase 1 (foundation)

Mode: quick. Scope: files modified between `main` and `phase-1-foundation` HEAD.

## Counts
- **High: 0**
- **Medium: 4**
- **Low: 3**

No High-impact items. Phase 1 is small enough that the obvious win (avoid duplicated round-trips between Guard and Dashboard) is Medium. Optimize is non-blocking by design.

---

## Medium

### M1 — Dashboard makes two sequential queries that could run in parallel
**File:** `apps/web/src/features/dashboard/Dashboard.tsx:20–38`

The `queryFn` does:
```ts
const profile = await supabase.from('profiles').select(...).single();
// ...
const userLangs = await supabase.from('user_languages').select(...).eq(...);
```

These are independent. Running them sequentially adds one round-trip (~50–150ms over WAN) for no reason. Wrap in `Promise.all`. Same applies to `OnboardingGuard.tsx:21–34`. On a slow mobile connection that's a noticeable difference on the dashboard's first paint.

**Estimated impact:** ~100ms faster TTFP for `/app`.

### M2 — `OnboardingGuard` and `Dashboard` re-fetch the same `profiles.display_name` separately
**Files:** `apps/web/src/features/onboarding/OnboardingGuard.tsx:23–27`, `apps/web/src/features/dashboard/Dashboard.tsx:21–25`

After onboarding completes, the user transitions Guard → Dashboard. Both run a `useQuery` that selects from `profiles`. They use different query keys (`['onboarding-status', userId]` vs `['dashboard', userId]`) so React Query doesn't share. That's two round-trips for what is effectively the same data on the same render-tree mount.

**Fix sketch:** consolidate into a single `useProfileSummary(userId)` hook keyed `['profile-summary', userId]` returning `{ displayName, nativeLanguageCode, targetLanguageCodes }`. Both components consume from the same cache entry.

**Estimated impact:** halves the post-onboarding round-trips. Compounds with M1.

### M3 — `loadEnv()` runs twice on app startup
**Files:** `apps/web/src/main.tsx:8`, `apps/web/src/lib/supabase.ts:4`

Both `main.tsx` and `lib/supabase.ts` call `loadEnv(import.meta.env)`. The Zod parse on two strings is ~µs each, so the perf cost is invisible — but the design smell is real: the env should be a single module-level singleton, not a function called from random places.

**Fix sketch:**
```ts
// apps/web/src/env.ts
let cached: Env | null = null;
export function getEnv(): Env {
  if (!cached) cached = loadEnv(import.meta.env as ...);
  return cached;
}
```
`main.tsx` calls `getEnv()` to trigger the validate-on-startup; `lib/supabase.ts` calls `getEnv()` to consume the parsed values.

**Estimated impact:** code clarity, not perf.

### M4 — `peat-start.jpg` is loaded eagerly without `decoding="async"` or `fetchpriority="low"`
**File:** `apps/web/src/features/dashboard/PeatyGreeting.tsx:9–15`

The illustration is below-the-fold-ish (under the header) but loaded eagerly. On a slow connection it can compete with the JS chunk for bandwidth. Adding `decoding="async"` lets the browser decode off the main thread. Since `peat-start.jpg` is the LCP candidate on `/app`, `fetchpriority="high"` (not low) is the right call — make it explicit.

```tsx
<img
  src="/peaty/peat-start.jpg"
  alt="Peaty the parrot waving hello"
  width={192} height={192}
  decoding="async"
  fetchPriority="high"
  className="rounded-full shadow-md"
/>
```

**Estimated impact:** modest LCP improvement on slow networks.

---

## Low

### L1 — `useAuthUser` calls `getUser()` (network) instead of `getSession()` (local)
**File:** `apps/web/src/features/auth/useAuthUser.ts:18–24`

See BugHunt I2. Not blocking, but for cold paint perf on every page (since `RequireAuth` mounts at every protected route), `getSession()` reads from localStorage and skips the network round-trip. Reflag in Phase 6 with the offline work.

### L2 — Render of `Dashboard` mounts even when `data` is undefined
**File:** `apps/web/src/features/dashboard/Dashboard.tsx:42–54`

The dashboard renders the Header with `displayName=null` and the PeatyGreeting with `displayName=null` while loading. That's a fine UX — no skeletons needed for this small surface — but a `useMemo` on `data?.targetLanguageCodes` would prevent the LanguageSelector's `useEffect` from triggering with a stable-but-recreated array reference. Right now `(userLangs.data ?? []).map(...)` returns a fresh array each query. Negligible at one user, but worth knowing.

### L3 — `vitest.config.ts` runs all unit tests in jsdom even though pure-logic tests don't need it
**File:** `apps/web/vitest.config.ts:14`

`environment: 'jsdom'` is set globally. Pure-logic tests (`env.test.ts`, `useActiveLanguage.test.ts`, `shared-import.test.ts`) don't need a DOM. A modest startup-time win is possible by selectively setting `environment: 'happy-dom'` per file, or by splitting into two configs. Not worth doing today.

---

## Things looked-at and cleared
- **Bundle size:** the dependency log lists all of: react, react-dom, react-router, react-hook-form, zod, @hookform/resolvers, @tanstack/react-query, @supabase/supabase-js, zustand. All are tree-shake-friendly with subpath imports, none are imported wholesale. There's no lodash / moment / date-fns in scope. ✓
- **Render hot paths:** none yet — there's no review loop or scoring loop in Phase 1. ✓
- **DB indexes:** all the indexes documented in `references/schema.md` are present in the migrations (`idx_reviews_user_due`, `idx_decks_owner` partial, `idx_decks_source_language`, `idx_cards_deck_id`, `idx_cards_language`, `idx_pron_user_card_created`, `idx_comp_user_card_created`). ✓
- **N+1 risk:** Dashboard does two queries, not N. ✓ (M1 is parallelism, not N+1.)
- **Edge Functions:** none in Phase 1. Cold-start, AbortController, payload size irrelevant. ✓
- **Service worker / PWA:** Phase 6. Out of scope. ✓
- **Complexity:** longest file in scope is `OnboardingWizard.tsx` at 74 lines. No file > 200 lines. No function > 60 lines. ✓

## Fix-request files generated
None — no High items. M1–M4 are recorded here; the user decides whether to schedule them as separate requests.
