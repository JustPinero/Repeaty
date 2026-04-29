# BugHunt — Phase 1 (foundation)

Mode: quick. Scope: files modified between `main` and `phase-1-foundation` HEAD.

## Counts
- **Critical: 0**
- **Warning: 4**
- **Info: 3**

No Critical findings — RLS is solid, integration tests prove cross-user isolation and tier-escalation prevention, no LLM/Whisper code yet so no cost-runaway surface in scope. The phase is mergeable per the skill's blocking rule.

---

## Warning

### W1 — `OnboardingGuard` and `Dashboard` swallow query errors silently
**Files:** `apps/web/src/features/onboarding/OnboardingGuard.tsx:18–46`, `apps/web/src/features/dashboard/Dashboard.tsx:17–39`

Both components use `useQuery` with no `onError` handling, no `error` branch in render. If the Supabase fetch fails (network blip, expired JWT, RLS regression), the components render `null` (Guard) or stale defaults (Dashboard greets "Hi there!" with no targets). The user sees a blank screen or a silently-degraded dashboard with no recourse.

**Reproduction:** stub the supabase client to throw or block the network. The Guard renders nothing forever. The Dashboard shows the "Hi there!" placeholder and "0 cards due" with no error message.

**Fix sketch:** render a small error banner with a Retry button when `isError`. For OnboardingGuard, choose between (a) treating an error as "needs onboarding" (renders the wizard), (b) showing an error region. (a) is wrong — it shows the wizard to a fully-onboarded user. Pick (b).

→ Fix request: `requests/phase-1-fixes/fix-bug-onboarding-dashboard-error-state.md`

### W2 — `ConfirmEmail` race: `getUser()` may run before `detectSessionInUrl` consumes the hash
**File:** `apps/web/src/pages/ConfirmEmail.tsx:12–39`

`supabase.auth.getUser()` is called inside the effect. `detectSessionInUrl` is async — Supabase parses the `#access_token=...` hash on the next tick. The first `getUser()` race-condition outcome is "no user" → the page renders the error "No active session found" briefly. In practice the auth listener fires shortly after and you'd typically catch it via `onAuthStateChange`, but this component does not subscribe.

**Reproduction:** open `/auth/confirm#access_token=...&refresh_token=...` directly. There's a brief window where `getUser()` returns `null` before the SDK flushes the URL params.

**Fix sketch:** prefer `onAuthStateChange` over the immediate `getUser()` call, or `await supabase.auth.getSession()` (synchronous read of localStorage) and fall back to `getUser()` after a short tick. Alternatively, listen for `SIGNED_IN` and resolve from there.

→ Fix request: `requests/phase-1-fixes/fix-bug-confirmemail-race.md`

### W3 — `useCompleteOnboarding` surfaces raw Postgres error messages to the user
**File:** `apps/web/src/features/onboarding/useCompleteOnboarding.ts:24–27`, rendered at `OnboardingWizard.tsx:67–69`

When the RPC raises with codes `42501` / `22023`, `error.message` is the raw English string from the function body ("display_name is required", "at least one target language is required"). That's tolerable for the wizard's own validation paths (which already prevent these inputs client-side) but problematic for `42501` ("not authenticated") which surfaces the Postgres SQLSTATE phrase without a user-friendly translation. A network error returns the supabase-js error message verbatim.

**Reproduction:** sign out in another tab, then submit the wizard — the user sees the bare Postgres error in `role="alert"`.

**Fix sketch:** map known error codes (or substrings) to localized strings before throwing. E.g. `if (error.code === '42501') throw new Error('Your session has expired. Please log in again.');`. supabase-js exposes `.code` on PostgrestError-style results.

→ Fix request: `requests/phase-1-fixes/fix-bug-onboarding-error-mapping.md`

### W4 — `Header.handleSignOut` ignores `signOut()` errors and navigates anyway
**File:** `apps/web/src/features/dashboard/Header.tsx:11–14`

```ts
async function handleSignOut() {
  await supabase.auth.signOut();   // no error check
  navigate('/login', { replace: true });
}
```

If `signOut()` rejects (network failure, server-side revocation problem), the navigation still happens, but the local session may not be cleared. The user lands on `/login` apparently logged-out, but `useAuthUser` may still hold the old user via the React Query cache + auth listener — meaning a subsequent navigation to `/app` could succeed without re-login. Edge case, but pinning the contract is cheap.

**Fix sketch:** even if `signOut` rejects, manually clear the relevant query cache entry / call `supabase.auth.signOut({ scope: 'local' })` as a fallback before navigating. At minimum, log the error (via `console.error` allowed by the lint config).

→ Fix request: `requests/phase-1-fixes/fix-bug-signout-error-handling.md`

---

## Info

### I1 — `post-edit-a11y.sh` runs eslint twice; first invocation is dead work
**File:** `scripts/hooks/post-edit-a11y.sh:14–18`

```bash
OUTPUT=$(pnpm exec eslint --rulesdir .eslintrc.a11y.cjs --no-eslintrc --rule "{}" \
           --plugin jsx-a11y --ext .tsx,.jsx "$FILE" 2>&1 || true)
# Use the project's actual eslint config — the line above is a fallback.
OUTPUT=$(pnpm exec eslint "$FILE" 2>&1 || true)
```

The first assignment is overwritten on the very next line — it's pure waste (one eslint cold start per save, ~1–2s). Also `--rulesdir` is the wrong flag for plugin loading; it expects a directory of rule files, not a config. The "fallback" was the intended invocation; the first call should be deleted. Pre-flagged in the orchestrator's context as a known small issue. Low priority — advisory hook, not a CI gate.

**Fix:** delete lines 15–17, keep only the second `pnpm exec eslint "$FILE"` call.

→ Fix request: `requests/phase-1-fixes/fix-bug-post-edit-a11y-double-eslint.md`

### I2 — `useAuthUser` uses `getUser()` instead of `getSession()` on mount
**File:** `apps/web/src/features/auth/useAuthUser.ts:18–24`

`supabase.auth.getUser()` issues a network call to `/auth/v1/user` to validate the JWT against the server. `getSession()` reads from localStorage and is synchronous-ish. For the initial mount, the network call is unnecessary if you trust the persisted JWT (which we do — it's the same JWT every request will use anyway). The network call also makes the hook fail-closed when offline, which we DO want eventually for offline PWA mode (Phase 6) but not as a silent drag on every page load.

Not a bug today; flag it now so Phase 6's offline work doesn't have to redo it.

### I3 — `loadEnv` runs twice at startup
**Files:** `apps/web/src/main.tsx:8`, `apps/web/src/lib/supabase.ts:4`

`main.tsx` validates env, then `lib/supabase.ts` (imported transitively) validates again. Cost is negligible (Zod parse on two strings) but it's duplicated work. A small refactor would cache the parsed env in a module-level singleton.

---

## Things looked-at and cleared
- **RLS isolation:** integration tests prove user-A cannot read user-B rows for profiles, decks, reviews. `tier`/`is_admin` self-promotion is blocked. Soft-deleted decks aren't visible. ✓
- **Secret exposure:** no server-side keys appear under `VITE_*`. `.env.example` only has the two anon-safe vars. ✓
- **Trigger correctness:** `on_auth_user_created` uses `coalesce(new.email, '')` per security-landmines.md. `security definer` + `set search_path = public` prevents search_path injection. ✓
- **CHECK constraints:** `decks_owner_matches_source` correctly enforces (bundled ↔ owner_id IS NULL). `tier IN ('free','pro','admin')`, `cefr_level IN ('A1'..'C2')`, `similarity_score BETWEEN 0 AND 1`, `response_ms >= 0`. ✓
- **A11y on the auth/onboarding/dashboard surfaces:** every input has `htmlFor`/`id` pairing, errors have `role="alert"`, buttons are `<button type="...">`, the Peaty `<img>` has descriptive alt text. The lint rule `jsx-a11y/recommended` is wired and `--max-warnings=0` blocks CI. ✓
- **CSRF / token handling:** Supabase auth handles JWT in localStorage with `autoRefreshToken: true`. No custom auth code. ✓
- **PostgREST input validation:** the only RPC is `complete_onboarding`, which validates inputs and raises with SQLSTATE. ✓

## Fix-request files generated
- `requests/phase-1-fixes/fix-bug-onboarding-dashboard-error-state.md` (Warning)
- `requests/phase-1-fixes/fix-bug-confirmemail-race.md` (Warning)
- `requests/phase-1-fixes/fix-bug-onboarding-error-mapping.md` (Warning)
- `requests/phase-1-fixes/fix-bug-signout-error-handling.md` (Warning)
- `requests/phase-1-fixes/fix-bug-post-edit-a11y-double-eslint.md` (Info, low priority — included because the orchestrator's context asked for it to be flagged)

Total: 4 Warnings + 1 Info = 5 fix-requests.
