# Phase 6 — PWA Polish, Multi-Language Coverage, Open Source Launch

PWA manifest with Peaty icon (192px + 512px + maskable), service worker via Workbox for offline cache of bundled decks and last-reviewed cards, install prompt UX, error boundaries on every route, accessibility audit (jsx-a11y + axe), bundled deck content for IT, RU, DE, JA, ZH (in addition to ES + FR from Phase 2). Public README, CONTRIBUTING.md, MIT LICENSE, .env.example, GitHub Actions CI, public repo published, deploy to Vercel + Supabase prod. Roadmap section in README documents Stripe, native iOS/Android via Capacitor, OpenAI TTS, and phoneme-level pronunciation scoring as future milestones.

**Exit criteria:** App installs as a PWA on iOS Safari and Chrome Android, supports all 7 launch languages with bundled starter decks, repo is public on GitHub with all docs in place, a fresh contributor can clone and run locally with the README alone, Lighthouse PWA + Accessibility scores ≥ 90.

Request files for Phase 6 will be authored after Phase 5 ships. Likely breakdown:

- 6.1 — PWA manifest + Workbox service worker config
- 6.2 — Install prompt UX (incl. iOS Safari "Add to Home Screen" hint)
- 6.3 — Error boundaries on every route + global error reporting
- 6.4 — Bundled deck content for IT, RU, DE, JA, ZH
- 6.5 — Accessibility audit pass (axe everywhere; fix all Critical/Serious findings)
- 6.6 — `CONTRIBUTING.md`, README polish, screenshots
- 6.7 — Production deploy (Vercel + Supabase Cloud) + post-deploy smoke tests
- 6.8 — Lighthouse PWA + a11y verification (≥ 90 each)
