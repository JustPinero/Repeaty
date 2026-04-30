# DriftAudit — Phase 2 (Flashcards & SRS)

Mode: quick. Scope: `references/*.md` vs files modified between `main` and `phase-2-flashcards` HEAD.

## Per-file Pass/Fail

| File                                         | Verdict | Notes                                                                                            |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `references/schema.md`                       | **Fail**| Migration `0009_seed_bundled_decks.sql` is not listed in the migrations naming section. The bundled-deck UUID-stability promise (Request 2.1's note) is not in the doc |
| `references/architecture.md`                 | **Fail**| (a) ts-fsrs spec line says `^4.7.1` but `packages/shared/package.json` declares `^4.5.0` (resolves to 4.7.1 — drift between spec and declared range). (b) shadcn-related deps `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate` shipped in Request 2.3 are not logged in the dep table. (c) `lucide-react` is in `apps/web/dependencies` but NOT used anywhere in source — under "Pending" should be moved to "remove unused" or have a justification. (d) Pending row "shadcn/ui (CLI-installed) | Phase 2 | Component primitives" — shipped, should be moved to a 2.3 row |
| `references/api-contracts.md`                | **Pass**| No Edge Functions added in Phase 2; spec is unchanged and remains accurate                       |
| `references/env-vars.md`                     | **Fail**| `VITE_PLATFORM` is read by `apps/web/src/platform/index.ts:14` (`'web'` default, `'capacitor'` future) but is not in the env-vars doc nor in `.env.example`. Optional vars still need to be documented |
| `references/repeaty-pwa.md`                  | **Pass**| Updated to mark TTS as live in 2.5 with `web.ts` + `web.test.ts` files. Mic-related Phase-4 stubs still correctly TBD |
| `references/deployment-landmines.md`         | **Pass**| Stack-specific list is unchanged in Phase 2 (no new infra, no new external services); content remains valid |
| `references/security-landmines.md`           | **Pass**| RLS notes for the new `decks`/`cards` reads remain correct (policies were Phase 1; bundled-decks integration test confirms isolation). Validators-helper section still spec-only since no Edge Function landed this phase |

## Specific divergences

### schema.md (Fail)
1. **Missing migration entry.** The "Migrations naming" section (lines 153-165 in current schema.md) lists migrations 0001–0008 by name. `0009_seed_bundled_decks.sql` is not listed. The migration shipped in Request 2.1 and contains 60 cards' worth of bundled deck inserts.
2. **Missing UUIDv5 stability note.** Request 2.1's spec ("the bundled deck IDs are stable UUIDv5s so dashboard code can hardcode references when needed") is mentioned in the request but not promoted into the schema.md "Tables / decks" or "Migrations" section. Anyone reading schema.md as the source of truth doesn't know that the bundled-deck UUIDs are derivation-stable, which is load-bearing for any future code that hardcodes "the Spanish starter deck" by id.

### architecture.md (Fail)
1. **ts-fsrs version drift.** Line 170 says `^4.7.1` but `packages/shared/package.json:16` declares `^4.5.0`. Both resolve to `4.7.1` per the lockfile. Either bump the package.json range to `^4.7.1` (matching the doc), or correct the doc to `^4.5.0` (matching the package). Pick one source of truth.
2. **Request 2.3 dep additions are missing.** The dep log has sections "Installed in Request 2.1" and "Installed in Request 2.2" but no "Installed in Request 2.3" — yet Request 2.3 shipped `class-variance-authority@^0.7.1`, `clsx@^2.1.1`, `tailwind-merge@^2.5.4`, and `tailwindcss-animate@^1.0.7` (via `apps/web/package.json`). All four are documented zero-extension shadcn deps; they need a row each per the doc's own convention. `lucide-react@^0.469.0` is also in the package but is **not used** in any modified file — justify or remove.
3. **`shadcn/ui (CLI-installed)` still listed as Pending.** Line 179 has `| shadcn/ui (CLI-installed) | Phase 2 | Component primitives` under Pending. shadcn primitives shipped in Request 2.3 (Button, Card, button-variants in `apps/web/src/components/ui/`). Move this row to a "Installed in Request 2.3" section; it's neither pending nor a single library install (shadcn is copy-paste, not a runtime dep).
4. **`dexie` still listed as Phase 2 pending.** Line 177 says `dexie | Phase 2 | IndexedDB wrapper for offline review queue`. Phase 2 has shipped without Dexie — the offline replay queue is deferred to Phase 6 per `references/repeaty-pwa.md:80-87`. Move this row to "Pending in Phase 6" or to DEBT-tracked work.

### env-vars.md (Fail)
- **`VITE_PLATFORM` is undocumented.** `apps/web/src/platform/index.ts:14` reads `import.meta.env.VITE_PLATFORM`. The doc's "Client-exposed" section lists `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` but not `VITE_PLATFORM`. Defaults to `'web'`; `'capacitor'` is the only other recognized value (and lands with DEBT-002). Add a row noting it's optional.
- `.env.example` should also include a commented-out `# VITE_PLATFORM=web` line for discoverability.

## Updates applied to references in this audit run

(See "Doc updates" section below — schema.md, env-vars.md, and architecture.md were patched directly, since the drift was docs-behind-code rather than code-against-design.)

## Doc updates applied

- `references/schema.md` — added migration `0009_seed_bundled_decks.sql` to the migrations naming list with a UUIDv5-stability note.
- `references/architecture.md` — added a "Installed in Request 2.3" section documenting `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`. Moved the `shadcn/ui (CLI-installed)` row out of Pending and into a 2.3 note. Moved `dexie` from Phase 2 to Phase 6. Corrected the `ts-fsrs` version row to match `packages/shared/package.json`.
- `references/env-vars.md` — added `VITE_PLATFORM` to the Client-exposed table.
- `.env.example` — added a commented `VITE_PLATFORM` line.

## Issues that need code-side fix (not silent doc rewrite)

### `lucide-react` is declared but unused
`apps/web/package.json:24` has `"lucide-react": "^0.469.0"` but no source file in `apps/web/src` imports from it. Either remove the dep (saves ~80KB raw / ~25KB gz from `node_modules`, no bundle impact since unused), or add the icon-import the team intends to use. This is code drift from the package.json — the architecture.md dep log can't honestly justify it without a "Reason: planned for the future X" caveat.

→ Fix-request file generated: `requests/phase-2-fixes/fix-drift-lucide-react-unused.md`

### `ts-fsrs` package.json range vs documented range
Pick one source of truth. Either bump `packages/shared/package.json:16` to `"ts-fsrs": "^4.7.1"` (matches the doc), or update the architecture.md row to `^4.5.0`. Since the lockfile resolves both to 4.7.1, the immediate behavior is identical — but the spec drift is exactly the kind of latent-rot that DriftAudit blocks future phases on.

→ Fix-request file generated: `requests/phase-2-fixes/fix-drift-ts-fsrs-version-spec.md`

## Blocking findings

**`schema.md` — Fail.** Per the skill's blocking rule, "Fail on `schema.md` or `architecture.md` blocks the next phase." Both are Fail in this audit. The drifts are documentation-behind-code (not the dangerous direction), so the audit run patches the docs in place — but the lucide-react and ts-fsrs items represent code-side drift (deps that don't match either the docs or what the team needs) and need fix-requests, not silent doc rewrites.

After this run's doc patches land, both `schema.md` and `architecture.md` are at Pass. The fix-request items need addressing **before** Phase 3 commences but do not block the current Phase 2 merge — they're at the architecture-dep-log level, not the schema/RLS level.

## Fix-request files generated

- `requests/phase-2-fixes/fix-drift-lucide-react-unused.md`
- `requests/phase-2-fixes/fix-drift-ts-fsrs-version-spec.md`
