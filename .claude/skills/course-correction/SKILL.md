---
name: course-correction
description: Invoke when a fundamental assumption breaks — schema is wrong, core dependency fails, user feedback invalidates a feature, or performance won't scale.
disable-model-invocation: true
---

# Course Correction

User-triggered only. The model must not invoke this on its own — corrections need explicit human framing.

## Sequence

1. **STOP** current work. Do not build on a broken foundation. Stash or commit any in-flight WIP first.
2. **Run `/drift-audit deep`** across all references to surface every doc that no longer matches reality (or no longer matches the new reality).
3. **Identify all downstream effects** — list every:
   - reference file that needs updating
   - phase whose plan changes
   - in-flight request that's now wrong
   - completed request that needs rework
   - DB migration that needs reversing or replacing
   - audit/debt entry that becomes obsolete or newly relevant
4. **Write the correction report** at `audits/correction-YYYY-MM-DD.md`:
   - **What changed** — the new fact or constraint
   - **Why** — surfacing what we missed before
   - **What's affected** — the lists from step 3
   - **Path forward** — concrete plan with new/changed requests
5. **Update affected reference files** — schema, architecture, api-contracts, env-vars, etc. Reference the correction report in each updated file's changelog section.
6. **Generate migration request files** — for code changes that need to happen, one request per concern. File them under `requests/phase-N-fixes/` or as new top-level requests if they reshape a phase.
7. **Present to user for approval.** Show the correction report + new request list. **Do NOT resume implementation until approved.**
8. **Re-prioritize the phase plan if needed.** Update `requests/` folder structure and `e2e-manifest.json` to reflect any flow changes.

## Examples that trigger course correction
- "Whisper isn't accurate enough on Russian; we need a different scoring approach."
- "Supabase RLS is too coarse for the multi-deck sharing model — we need a row-level permission table."
- "The friend (beta user) said the speed-scoring formula feels punishing; we need to redesign comprehension scoring."
- "OpenAI changed the Whisper response shape and our existing migrations don't fit."

## Anti-pattern
Do NOT use this skill for normal bug fixes, performance issues, or feature scope tweaks. Those go through the regular request flow. Course correction is for foundational shifts only.
