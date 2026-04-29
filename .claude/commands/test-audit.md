---
description: Run TestAudit only. Usage `/test-audit [phase-number|file-path] [quick|deep]`.
---

Delegate to the `audit-runner` subagent with the `test-audit` skill.

Default scope: current phase (quick mode).
Deep mode reviews tests across the entire codebase.

Return the report path and a one-paragraph summary including the letter grade and the top three gaps.
