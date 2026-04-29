# Architecture — Repeaty

## Stack (confirmed at kickoff, 2026-04-29)

| Layer            | Choice                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| Framework        | React 18 + Vite + TypeScript                                            |
| Styling          | Tailwind CSS                                                            |
| UI primitives    | shadcn/ui                                                               |
| Local DB / cache | Dexie (IndexedDB)                                                       |
| Service worker   | Workbox                                                                 |
| State            | TanStack Query (server) + Zustand (cross-component UI) + local `useState` |
| Schema validation| Zod                                                                     |
| Backend          | Supabase (Postgres + Auth + Storage + Edge Functions/Deno)              |
| AI               | Anthropic Claude (lessons + feedback) via Edge Function proxy           |
| Speech-to-text   | OpenAI Whisper via Edge Function proxy                                  |
| Text-to-speech   | Browser SpeechSynthesis (free, offline-capable)                         |
| Hosting          | Vercel (web), Supabase Cloud (backend)                                  |
| Testing          | Vitest (unit/component), Playwright (E2E), Supabase local (migrations)  |
| Lint             | ESLint with `jsx-a11y` + Playwright + axe-core for runtime a11y         |
| Package manager  | pnpm (workspaces)                                                       |
| Node / pnpm      | Node 22 / pnpm 10                                                       |

## Monorepo layout

```
apps/web/                 React + Vite PWA (the only client)
packages/shared/          Cross-cutting types, Zod schemas, FSRS algorithm
supabase/migrations/      SQL migrations (append-only)
supabase/functions/       Edge Functions (Deno)
  ├── score-pronunciation/   Whisper proxy
  ├── generate-lesson/       Claude proxy (Pro)
  └── generate-feedback/     Claude proxy (Pro)
```

The shared package is critical: types like `Card`, `Deck`, `Profile`, `Review`, `PronunciationAttempt`, `ComprehensionAttempt` are imported by both `apps/web` and `supabase/functions/*`. Drift here is a primary failure mode — the `drift-audit` skill watches it.

## Capacitor-aware abstraction

Even though v1 ships only as a PWA, the architecture is wrappable for native iOS/Android via Capacitor without rewriting feature code. Platform-specific surfaces live behind a thin abstraction:

```
apps/web/src/platform/
  ├── index.ts              // Public API: { record, playback, sttPermissions, push }
  ├── web.ts                // Web implementations (MediaRecorder, SpeechSynthesis, ...)
  └── capacitor.ts          // Capacitor implementations (added when DEBT-002 activates)
```

Feature code imports from `@/platform`, never from `@capacitor/*` or `navigator.mediaDevices` directly. See `references/repeaty-pwa.md` for details.

## ADR log

### ADR-001 — Vite + React over Next.js
**Status:** Accepted (2026-04-29)
**Context:** Repeaty is a pure SPA + PWA. No SSR, no server-rendered marketing surface, no edge rendering. Capacitor wrap is a future requirement.
**Decision:** Vite + React.
**Consequences:** Smaller bundle, faster HMR, clean Capacitor wrapping. Forfeit Next.js's SSR/RSC and built-in API routes (we use Supabase Edge Functions instead).

### ADR-002 — Supabase over a hand-rolled backend
**Status:** Accepted (2026-04-29)
**Context:** Auth + Postgres + Storage + Functions are all we need. Building those by hand is weeks of yak-shaving for a solo project.
**Decision:** Supabase Cloud.
**Consequences:** Vendor lock-in (Postgres + RLS + Storage are portable; Edge Functions and Auth are stickier). RLS is now a load-bearing security control — every table needs explicit policies.

### ADR-003 — pnpm workspaces over Turborepo / Nx
**Status:** Accepted (2026-04-29)
**Context:** Monorepo with two workspaces (apps/web, packages/shared) plus supabase/. We don't need cross-package build orchestration today.
**Decision:** pnpm workspaces only. Add Turborepo if/when caching becomes a bottleneck.
**Consequences:** Simpler. Fewer config files. Cold builds rebuild everything (acceptable at this size).

### ADR-004 — Browser SpeechSynthesis over OpenAI TTS for v1
**Status:** Accepted (2026-04-29)
**Context:** TTS adds per-call cost. Browser SpeechSynthesis is free, offline-capable, and acceptable quality for ES/FR/DE/IT/RU. Mixed quality for JA/ZH.
**Decision:** Browser TTS in v1. OpenAI TTS deferred for JA/ZH as a Pro feature ([DEBT-003](../audits/debt.md)).
**Consequences:** No cost on TTS in v1. JA/ZH users get acceptable but not great audio.

### ADR-005 — Zustand over Redux / Jotai for cross-component UI state
**Status:** Accepted (2026-04-29)
**Context:** We need a small store for cross-component UI state (theme, current language, in-flight session) outside of TanStack Query's server state.
**Decision:** Zustand.
**Consequences:** Tiny API surface. Hooks-friendly. Easier to teach a contributor.

### ADR-006 — FSRS over SM-2 for spaced repetition
**Status:** Accepted (2026-04-29)
**Context:** SM-2 is older and less accurate than FSRS. FSRS has open implementations.
**Decision:** Implement FSRS in `packages/shared/fsrs.ts` using the open algorithm; tune defaults later from real review data.
**Consequences:** Better scheduling. Slightly more complex state per `Review`. The state blob is opaque to the client UI — it's just persisted between rating events.

### ADR-007 — Levenshtein-on-Whisper-transcript for v1 pronunciation scoring
**Status:** Accepted (2026-04-29)
**Context:** Phoneme-level alignment is more accurate but adds substantial complexity and dependency footprint.
**Decision:** Score by normalized Levenshtein distance between Whisper transcript and expected target text. Phoneme-level scoring deferred ([DEBT-004](../audits/debt.md)).
**Consequences:** Good enough for v1; doesn't catch fine-grained accent issues. Russian needs Cyrillic-aware normalization (NFC + casefold + dehyphenation) before comparison.

### ADR-008 — Manual `tier` flag in v1, Stripe deferred
**Status:** Accepted (2026-04-29)
**Context:** Stripe integration is several days of work. v1 beta is a single user (a friend); manual flips suffice.
**Decision:** `profiles.tier` enum (`free | pro | admin`). `/admin` route in-app for flips. Stripe ([DEBT-001](../audits/debt.md)).
**Consequences:** No billing infra in v1. Activate via `/activate DEBT-001` post-launch.

### ADR-009 — TanStack Query over SWR or hand-rolled fetch caching
**Status:** Accepted (2026-04-29)
**Context:** We need server-state caching, optimistic updates, retry, and offline behavior tied to Supabase.
**Decision:** TanStack Query.
**Consequences:** One mental model for all server data. Plays well with Dexie for offline persistence (custom persister).

## Dependency log

Every new dependency added after kickoff appends a row here with: package name, version, why we picked it, what we considered, what it costs (bundled bytes if client, monthly cost if external service).

### Installed in Request 1.1 (monorepo scaffold)

| Package                              | Version    | Reason                                           | Considered                  | Cost                  |
| ------------------------------------ | ---------- | ------------------------------------------------ | --------------------------- | --------------------- |
| react                                | ^18.3.1    | UI framework                                     | (n/a — kickoff)             | ~6KB gz               |
| react-dom                            | ^18.3.1    | DOM renderer                                     | (n/a)                       | ~40KB gz              |
| zod                                  | ^3.23.8    | Runtime validation (env, API, LLM responses)     | yup, valibot                | ~13KB gz              |
| vite                                 | ^5.4.10    | Build + dev server                               | Next.js (rejected per ADR-001) | dev-only           |
| @vitejs/plugin-react                 | ^4.3.3     | React plugin for Vite                            | swc plugin                  | dev-only              |
| typescript                           | ^5.6.3     | Language                                         | (n/a)                       | dev-only              |
| tailwindcss                          | ^3.4.14    | Styling                                          | vanilla CSS, CSS modules    | dev-only (purged)     |
| postcss + autoprefixer               | ^8.4.49 / ^10.4.20 | Tailwind toolchain                       | (n/a)                       | dev-only              |
| eslint                               | ^8.57.1    | Lint (v8 to keep jsx-a11y plugin chain stable)   | eslint v9 flat config       | dev-only              |
| eslint-plugin-jsx-a11y               | ^6.10.2    | A11y enforcement (CI-blocking per coding-standards) | (n/a)                    | dev-only              |
| eslint-plugin-react / -react-hooks   | ^7.37.2 / ^5.0.0 | Standard React lint                        | (n/a)                       | dev-only              |
| eslint-plugin-react-refresh          | ^0.4.14    | Fast Refresh hygiene                             | (n/a)                       | dev-only              |
| @typescript-eslint/parser + plugin   | ^7.18.0    | TS-aware ESLint                                  | (n/a)                       | dev-only              |
| @types/eslint                        | ^8.56.12   | Type-check the eslint-config test                | (n/a)                       | dev-only              |
| vitest                               | ^2.1.4     | Unit/component test runner                       | jest                        | dev-only              |
| jsdom                                | ^25.0.1    | DOM env for vitest                               | happy-dom                   | dev-only              |
| @testing-library/react / -jest-dom / -user-event | ^16.0.1 / ^6.6.3 / ^14.5.2 | Component testing               | (n/a)                       | dev-only              |
| @playwright/test                     | ^1.48.2    | E2E (config skeleton; specs land in 1.3+)        | cypress                     | dev-only              |
| prettier                             | ^3.3.3     | Formatter (single source of truth)               | dprint                      | dev-only              |

### Pending (added in later requests)

| Package                       | Planned in   | Reason                                                  |
| ----------------------------- | ------------ | ------------------------------------------------------- |
| @supabase/supabase-js         | 1.3          | Supabase client (auth + RLS-respecting reads)            |
| react-router-dom              | 1.3          | Client-side routing                                      |
| react-hook-form               | 1.3          | Forms with Zod-validated submission                      |
| @hookform/resolvers           | 1.3          | Zod resolver for react-hook-form                         |
| zustand                       | 1.5          | Cross-component UI state (active language, wizard state) |
| @tanstack/react-query         | 1.5          | Server-state caching                                     |
| dexie                         | Phase 2      | IndexedDB wrapper for offline review queue               |
| workbox-*                     | Phase 6      | Service worker for PWA offline                           |
| shadcn/ui (CLI-installed)     | Phase 2      | Component primitives                                     |

## Phases (live build plan)

| Phase | Focus                          | Branch                       | Exit criteria summary                                                          |
| ----- | ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------ |
| 1     | Foundation                     | `phase-1-foundation`         | Signup → onboarding → dashboard. RLS verified.                                 |
| 2     | Flashcards & SRS               | `phase-2-flashcards`         | FSRS-scheduled review session on bundled ES/FR decks; TTS plays correctly.     |
| 3     | Comprehension (speed scoring)  | `phase-3-comprehension`      | Type/select translation, combined accuracy×speed score, history persists.      |
| 4     | Pronunciation (Whisper)        | `phase-4-pronunciation`      | Mic capture, Whisper score, history with playback. iOS Safari quirks documented. |
| 5     | AI Personalization (Pro gate)  | `phase-5-ai-personalization` | `generate-lesson` + `generate-feedback` Edge Functions; Pro RLS gate; `/admin`. |
| 6     | PWA polish + multi-language    | `phase-6-pwa-launch`         | All 7 languages bundled. Public repo + README. Lighthouse ≥ 90.                |

Detailed exit criteria live in each phase's request files.
