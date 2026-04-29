---
description: Run BugHunt only. Usage `/bughunt [phase-number|file-path] [quick|deep]`.
---

Delegate to the `audit-runner` subagent with the `bughunt` skill.

Default scope: current phase (quick mode).
Deep mode hunts across the entire codebase.

Return the report path and a one-paragraph summary including counts per priority tier. Highlight every Critical at the top — they block the next phase.
