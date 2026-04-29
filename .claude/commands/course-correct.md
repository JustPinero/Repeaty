---
description: Trigger course correction protocol when a fundamental assumption breaks. Usage `/course-correct [description of what changed]`.
disable-model-invocation: true
---

Invoke the `course-correction` skill with `$ARGUMENTS` as context.

This is for foundational shifts only — schema is wrong, core dependency fails, user feedback invalidates a feature, performance won't scale. Normal bug fixes go through the regular request flow.

The skill will:
1. STOP current work.
2. Run `/drift-audit deep`.
3. Identify all downstream effects.
4. Write `audits/correction-YYYY-MM-DD.md`.
5. Update affected reference files.
6. Generate migration request files.
7. Present everything to the user for approval.
8. Re-prioritize the phase plan.

Do NOT resume implementation until the user explicitly approves the correction report.
