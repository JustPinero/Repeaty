---
name: coding-standards
description: Full coding standards reference. Loaded when writing or reviewing code.
---

# Coding Standards — Repeaty

The five core rules live in `CLAUDE.md`. Everything below extends those rules with stack-specific details.

## Stack-agnostic standards

- **Explicit over implicit.** Names beat comments. If a name needs a comment to be understood, the name is wrong.
- **One concern per function.** A function that fetches AND transforms AND renders is three functions.
- **All async code handles errors explicitly.** No bare `await` outside try/catch unless the framework boundary above guarantees it (e.g. React Query's `error` field, Edge Function top-level handler).
- **Validate all external data with Zod before DB or business logic.** "External" = anything off the wire (request body, URL params, JSON.parse on stored blobs, LLM responses).
- **Consistent API response shapes.** Edge Functions return `{ data, error, meta? }`. Errors carry a `code` (string enum) and a human-readable `message`. HTTP status mirrors the error class (400 / 401 / 403 / 404 / 429 / 500).
- **No magic numbers/strings.** Constants get names in a `constants.ts` near the consumer or in `packages/shared` if cross-package.
- **Every new dependency is justified** in a fresh ADR entry in `references/architecture.md` (one paragraph: what it does, what we considered, why it won, what it costs in bytes/maintenance).
- **Soft deletes on user data.** Use `deleted_at TIMESTAMPTZ NULL`. RLS policies must filter `deleted_at IS NULL` on read paths.
- **All timestamps in UTC** at storage (`TIMESTAMPTZ`) and in transit (ISO-8601 with `Z`). Local-time conversion is a render concern, not a storage concern.
- **No commented-out code in commits.** Use git for history.
- **No `console.log` in committed code.** Use a real logger (Edge Functions: `console.error` with structured payload; client: a thin `logger.ts`). Lint enforces.
- **No placeholder TODOs without a `DEBT-NNN` reference in `audits/debt.md`.**

## A11y (CI-blocking)

Every interactive element must:
- be a native HTML element (`button`, `a`, `input`, `select`, `textarea`), **OR**
- have `role`, `tabIndex={0}`, keyboard handlers (`onKeyDown` for Enter/Space at minimum), and an accessible name (`aria-label` or associated text).
- Form labels MUST associate via `htmlFor` (not wrapping or proximity alone).
- Images have meaningful `alt`; decorative images use `alt=""`.
- Modals/dialogs: focus trap, Escape closes, focus returns to trigger on close.

`jsx-a11y` and `axe-core` (Playwright) enforce. Violations block CI.

## React-specific

- **Function components only.** No class components.
- **Custom hooks for non-trivial state logic.** Naming: `useX` where X is the noun (e.g. `useReviewSession`, not `useReviewSessionLogic`).
- **State colocation.** Local state stays in the component until a second consumer needs it; only then lift or move to TanStack Query / Zustand.
- **Server state via TanStack Query.** Local state via `useState`/`useReducer`. Cross-component UI state via Zustand. Never via React Context for non-trivial state — Context is for theming/auth/locale only.
- **Keys are stable IDs.** Never array index unless the list is immutable and ordered.
- **`useEffect` is a last resort.** Most effects are derived state in disguise. Reach for it only for true side effects (subscriptions, imperative APIs, syncing with non-React state).

## TypeScript

- **No `any`.** If you reach for `any`, the type modeling is wrong. Use `unknown` + narrowing.
- **No non-null assertion (`!`)** without proving the value exists in code immediately above (e.g. `if (!x) throw …; x.foo`).
- **`type` for unions/intersections; `interface` for object shapes that may be extended.**
- **Shared types live in `packages/shared`.** Both web and Edge Functions import from there. Never duplicate.
- **Zod schemas are the source of truth** for runtime validation. Derive TS types via `z.infer` rather than maintaining parallel definitions.

## Supabase / Postgres

- **Every table has RLS enabled.** Enabling RLS without policies = locked down. Add policies explicitly.
- **Every user-owned table has a `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.**
- **Every table has `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`** and (when mutable) `updated_at` with a trigger.
- **Migrations are append-only and named `NNNN_description.sql`.** Never edit a migration after it's been applied to a remote env.
- **Indexes for every query path** — verify with `EXPLAIN` for queries touching > 1k rows.
- **Foreign keys with explicit `ON DELETE`** (cascade for owned-by, restrict for shared/bundled).

## Edge Functions (Deno)

- **One concern per function.** `score-pronunciation`, `generate-lesson`, `generate-feedback`. Don't merge them.
- **Always validate the JWT** at the top — use `supabase.auth.getUser(token)`. Never trust client-claimed user ID.
- **AbortController with 15s timeout** on every external API call (Whisper, Claude). Return 504 on timeout.
- **Strip markdown code fences** from LLM JSON responses before `JSON.parse`. Wrap parse in try/catch. Validate with Zod.
- **Per-user daily rate limits** for paid-tier features. Track in a `rate_limits` table or use Supabase's built-in (whichever lands cheaper).
- **Log structured events** (JSON to stdout) — at minimum `{ fn, user_id, latency_ms, status, cost_estimate_usd }` for each call.

## Tests

- **One test per acceptance criterion.** Test name mirrors the criterion.
- **Integration tests use the real local Supabase** (started via `supabase start`). Never mock the database.
- **Component tests use Testing Library.** Query by accessible role/name, not by class or test-id (test-id is a last resort, signals a missing accessible name).
- **Playwright E2E tests are tagged** with `@phase-N` and `@complete` so the manifest can route which run in CI.

## File structure

- **Feature folders:** `apps/web/src/features/<feature>/{components,hooks,api,types.ts,index.ts}`. Cross-feature imports go through `index.ts` only.
- **Shared UI:** `apps/web/src/components/ui/` for shadcn primitives; `apps/web/src/components/peaty/` for mascot UI.
- **Edge Functions:** one folder per function, `index.ts` is the entry, shared logic in `_shared/` (Supabase convention).
