# Repeaty

> Repeat after Peaty.

A PWA that unifies three language-learning modes — **SRS flashcards**, **comprehension speed scoring**, and **pronunciation feedback** — into one personalized loop. Pro-tier users get AI-generated decks and AI feedback tailored to their native language and CEFR level.

## Status

🚧 **Phase 1 — Foundation.** Building in public. See [`requests/`](requests/) for the live phased build plan and [`audits/debt.md`](audits/debt.md) for the deferred-work backlog.

## Why three modes in one app

Most language apps optimize for one mode (Duolingo for drills, Anki for SRS, phrasebooks for travel). Serious learners stitch three apps together. Repeaty unifies them, then layers AI feedback on top.

## Stack

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, shadcn/ui, Dexie, Workbox PWA.
- **Backend:** Supabase — Postgres + Auth + Storage + Edge Functions (Deno).
- **AI:** Anthropic Claude (lesson + feedback generation), OpenAI Whisper (pronunciation transcription). Server-side proxies only — keys never reach the browser.
- **TTS:** Browser SpeechSynthesis (free, offline-capable). OpenAI TTS deferred for ja/zh as a future Pro feature.
- **Testing:** Vitest + Playwright + Supabase local for migration tests.

See [`references/architecture.md`](references/architecture.md) for the full ADR log.

## Languages at launch

Spanish, French, German, Italian, Russian, Japanese, Mandarin.

## Local setup

```bash
git clone https://github.com/JustPinero/Repeaty.git
cd Repeaty
pnpm install
cp .env.example .env.local       # fill in Supabase URL + anon key
supabase start                    # local Postgres + Auth + Storage + Functions
supabase db push                  # apply migrations
pnpm --filter @repeaty/web dev    # http://localhost:5173
```

Server-side keys (Whisper, Claude) are configured per-environment via `supabase secrets set` — never put them in `.env.local`. See [`references/env-vars.md`](references/env-vars.md).

## How the build runs

This repo follows a phased, audit-gated build. Each phase lives on its own branch; each request inside a phase is one commit. After every phase, four audits run automatically — `test-audit`, `bughunt`, `optimize`, `drift-audit` — and any Critical findings block the next phase. See [`CLAUDE.md`](CLAUDE.md) for the action loop and [`requests/`](requests/) for the live request files.

## Roadmap (post-v1)

- **Stripe billing** ([DEBT-001](audits/debt.md)) — replace the manual `/admin` tier toggle.
- **Native iOS/Android via Capacitor** ([DEBT-002](audits/debt.md)) — platform abstraction layer is already in place.
- **OpenAI TTS for Japanese/Mandarin** ([DEBT-003](audits/debt.md)) — Pro-tier audio quality upgrade.
- **Phoneme-level pronunciation scoring** ([DEBT-004](audits/debt.md)) — replace Levenshtein-on-transcript with phoneme alignment.

## Contributing

Issues and PRs welcome once Phase 1 lands. The repo follows TDD by default (RED → GREEN → Validate); see [`CLAUDE.md`](CLAUDE.md) and [`.claude/skills/coding-standards/SKILL.md`](.claude/skills/coding-standards/SKILL.md). A fuller `CONTRIBUTING.md` ships in Phase 6.

## License

MIT — see [`LICENSE`](LICENSE).

---

Built as a personal gift for a friend who tests v1 in five languages, then opened up to anyone who wants the same loop.
