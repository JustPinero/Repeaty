---
name: session-handoff
description: Use when context is getting heavy or before ending a session. Writes a handoff file so the next session has full continuity.
---

# Session Handoff

Triggered by `/handoff`. Generates `.claude/handoff.md` with everything the next session needs to PRIME cleanly without re-reading the entire conversation.

## What to write

```markdown
# Handoff — <YYYY-MM-DD HH:MM TZ>

## Phase / Request in progress
- Phase: <N — name>
- Request: <X.Y — title>
- Branch: <phase-N-name>
- Step in action loop: <PRIME | PLAN | RED | GREEN | VALIDATE>

## Done this session
- <Files changed with one-line description each>
- <Tests written / passing>
- <Decisions made (cite the relevant request or reference file)>
- <Audit findings raised, if any>

## Remaining on current request
- <Specific next steps, ordered>
- <Any tests still failing — name them>
- <Any open questions that block progress>

## Test status
- Unit: <PASS / FAIL — N tests, M failing>
- E2E (applicable): <PASS / SKIP — flows in scope>
- Lint (incl. a11y): <PASS / FAIL>
- Types: <PASS / FAIL>

## Blockers
- <Anything that requires user input or external action>

## Exact next step
- <One sentence. The very next concrete action when the next session starts.>
```

## Rules
- Keep it under 100 lines. The next session reads this in PRIME — every line should earn its place.
- Cite file paths with `path:line` when referencing specific code locations.
- Never include secrets or full env values.
- Reference request files by ID, not by retelling them.
- After writing, confirm the file path and a one-sentence summary in chat.

## Cleanup
The next session's PRIME step incorporates this file and **deletes it**. Stale handoff files are worse than none — never carry them across phases.
