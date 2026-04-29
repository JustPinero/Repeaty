---
description: Run all four phase-end audits. Usage `/run-audits [phase-number] [quick|deep]`.
---

Delegate to the `audit-runner` subagent with all four audit skills (`test-audit`, `bughunt`, `optimize`, `drift-audit`).

Defaults:
- Phase number: current phase (read from branch name `phase-N-...` or ask user).
- Mode: `quick` (scoped to files touched in the phase).

Deep mode scopes to the entire codebase.

When the subagent returns, present the summary back to the user with:
- Per-skill scores
- Total fix requests generated
- **Blocking findings highlighted at the top** (Criticals from bughunt, Fail on schema/architecture from drift-audit, D/F on critical paths from test-audit)

If any blocking finding exists, do NOT recommend proceeding to the next phase.
