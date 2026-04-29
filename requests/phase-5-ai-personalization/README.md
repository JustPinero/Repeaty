# Phase 5 — AI Personalization (Pro Tier gate)

`generate-lesson` Edge Function calls Claude with full user context (native language, target language, CEFR level, recent weak words from Reviews and Attempts) and returns a structured JSON deck (validated against shared Zod schema, markdown fences stripped, 15s timeout via AbortController). `generate-feedback` Edge Function returns level-appropriate coaching for mid-range and low scores. Feedback caching by `(card_id, error_pattern)`. Pro `tier` flag on `profiles`, RLS policies gate both Edge Functions. Internal `/admin` route for tier flips. Stripe deferred (DEBT-001).

**Exit criteria:** A user marked `pro` can generate a personalized deck and receive AI feedback on imperfect attempts; a `free` user gets bundled decks and canned feedback only; an `admin` can flip a user's tier from `/admin`; cost per AI call logged for monitoring; rate limits enforced.

Request files for Phase 5 will be authored after Phase 4 ships. Likely breakdown:

- 5.1 — `generate-lesson` Edge Function + Zod schemas
- 5.2 — `generate-feedback` Edge Function + caching
- 5.3 — Pro tier RLS gates + UI affordances (Pro badge, gated buttons)
- 5.4 — `/admin` route + tier toggle
- 5.5 — Per-user rate limits (`rate_limits` table) + admin dashboard view
- 5.6 — Cost-per-call dashboard query + structured logging contract
