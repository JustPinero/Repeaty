---
description: Run Optimize only. Usage `/optimize [phase-number|file-path] [quick|deep]`.
---

Delegate to the `audit-runner` subagent with the `optimize` skill.

Default scope: current phase (quick mode).
Deep mode reviews the entire codebase.

Return the report path and a one-paragraph summary listing High-impact items (which become fix requests) and a count of Medium-impact items the user may want to schedule manually.
