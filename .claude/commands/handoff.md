---
description: Write session handoff before ending. Usage `/handoff`.
---

Invoke the `session-handoff` skill. Write `.claude/handoff.md` per the skill's template.

After writing, confirm the file path and present a one-sentence summary of what the next session needs to know.

The next session's PRIME step incorporates this file and **deletes it** automatically — never read a stale handoff.
