---
description: Run DriftAudit. Usage `/drift-audit [quick|deep]`.
---

Delegate to the `audit-runner` subagent with the `drift-audit` skill.

Quick mode compares references/ files against files touched in the current phase. Deep mode compares against the entire codebase.

Return the report path and per-file Pass/Fail status. Fail on `schema.md` or `architecture.md` blocks the next phase — call this out at the top of the response.
