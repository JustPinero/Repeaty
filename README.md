# Repeaty

> Repeat after Peaty.

A PWA that unifies three language-learning modes — **SRS flashcards**, **comprehension speed scoring**, and **pronunciation feedback** — into one personalized loop. Pro-tier users get AI-generated decks and AI feedback tailored to their native language and CEFR level.

## Status

**v1 beta is live:** https://repeaty.vercel.app

| Phase | Focus                          | Status |
| ----- | ------------------------------ | ------ |
| 1     | Foundation                     | ✓ shipped |
| 2     | Flashcards & SRS               | ✓ shipped |
| 3     | Comprehension (speed scoring)  | ✓ shipped |
| 4     | Pronunciation (Whisper)        | ✓ shipped |
| 5     | AI Personalization (Pro gate)  | ✓ shipped |
| 6     | PWA polish + multi-language    | ✓ shipped |
| 7     | Deployment (Vercel + Supabase Cloud) | ✓ shipped |

See [`requests/`](requests/) for the per-phase request files, [`audits/`](audits/) for audit reports, and [`audits/debt.md`](audits/debt.md) for the deferred-work backlog.

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
bash scripts/dev-up.sh --reset    # toolchain check + install + supabase + dev server
```

`scripts/dev-up.sh` is the one-shot spin-up: verifies pnpm + supabase CLI + docker, installs deps, starts Supabase if needed, applies migrations on `--reset`, writes `apps/web/.env.local`, prints all the URLs (Studio, Inbucket, Postgres), then launches Vite. Pass `--with-functions` to also background-start `supabase functions serve` for the Pro-tier features. See `bash scripts/dev-up.sh --help` for all flags.

Server-side keys (Whisper, Claude) live in `supabase/.env` locally and `supabase secrets set` in production — never `VITE_`-prefixed. See [`references/env-vars.md`](references/env-vars.md).

## How the build runs

This repo follows a phased, audit-gated build. Each phase lives on its own branch; each request inside a phase is one commit. After every phase, four audits run automatically — `test-audit`, `bughunt`, `optimize`, `drift-audit` — and any Critical findings block the next phase. See [`CLAUDE.md`](CLAUDE.md) for the action loop and [`requests/`](requests/) for the live request files.

## Roadmap (post-v1)

The numbered DEBT entries are activatable — each carries explicit `To activate` steps in [`audits/debt.md`](audits/debt.md).

- **Stripe billing** ([DEBT-001](audits/debt.md)) — replace the manual `/admin` tier toggle.
- **Native iOS/Android via Capacitor** ([DEBT-002](audits/debt.md)) — platform abstraction layer is already in place.
- **OpenAI TTS for Japanese/Mandarin** ([DEBT-003](audits/debt.md)) — Pro-tier audio quality upgrade.
- **Phoneme-level pronunciation scoring** ([DEBT-004](audits/debt.md)) — replace Levenshtein-on-transcript with phoneme alignment.
- **Free-tier audio file blob cleanup** ([DEBT-005](audits/debt.md)).
- **`pronunciation-session` E2E flake fix** ([DEBT-006](audits/debt.md)).
- **Properly-sized PWA icons + remaining Peaty poses** ([DEBT-007](audits/debt.md)).
- **Offline queueing for pronunciation attempts** ([DEBT-008](audits/debt.md)).

## Contributing

Issues and PRs welcome once Phase 1 lands. The repo follows TDD by default (RED → GREEN → Validate); see [`CLAUDE.md`](CLAUDE.md) and [`.claude/skills/coding-standards/SKILL.md`](.claude/skills/coding-standards/SKILL.md). A fuller `CONTRIBUTING.md` ships in Phase 6.

## License

MIT — see [`LICENSE`](LICENSE).

---

Built as a personal gift for a friend who tests v1 in five languages, then opened up to anyone who wants the same loop.
