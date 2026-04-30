# Fix — `lucide-react` is declared as a dependency but unused

## What's wrong
`apps/web/package.json:24` declares `"lucide-react": "^0.469.0"` as a runtime dependency. A grep across `apps/web/src` returns zero imports of `lucide-react` or any icon from it. The dependency was added during Request 2.3 (shadcn primitives), presumably in anticipation of needing icons, but no Phase-2 surface uses one.

## Why it matters
- **Drift between code and architecture.md's dep log:** the new "Installed in Request 2.3" section in `references/architecture.md` (added by this DriftAudit's doc patch) lists shadcn-related deps. Including `lucide-react` there would require justifying it; leaving it out means the package.json and the doc don't agree.
- **Phantom dependency surface:** unused deps still get audited for vulnerabilities, still pull updates, and still show up in `pnpm outdated` noise.
- **Bundle protection:** if a future feature imports a single icon naively (`import { Sparkles } from 'lucide-react'`), tree-shaking saves us. But the team should make the import-pattern decision deliberately, not inherit it implicitly.

## Proposed fix
Two paths — pick one:

**Option A (preferred for Phase 2 close-out):** remove the dep.
```bash
pnpm --filter @repeaty/web remove lucide-react
```
Update `pnpm-lock.yaml` accordingly. No source changes.

**Option B:** keep the dep, but add at least one real usage now (e.g. replace the `🔊` emoji on `Flashcard.tsx:64` with a `<Volume2 />` icon) and add a row to `references/architecture.md`'s 2.3 section justifying it ("icon library for UI primitives; per-icon imports tree-shake").

## Files to touch
Option A:
- `apps/web/package.json` — remove the `lucide-react` line
- `pnpm-lock.yaml` — regenerate via `pnpm i`

Option B:
- `apps/web/src/features/decks/Flashcard.tsx` — replace the speaker emoji with a `<Volume2 />` icon import
- `references/architecture.md` — add a row to "Installed in Request 2.3"

## Acceptance criteria
- `grep -r "from 'lucide-react'" apps/web/src` returns either zero results (Option A, dep removed) or at least one (Option B, dep justified).
- `pnpm i` runs cleanly.
- `bash scripts/validate.sh` passes.
- The dep state in package.json matches the architecture.md dep log.
