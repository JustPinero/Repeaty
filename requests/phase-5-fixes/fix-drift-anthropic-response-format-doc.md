# Fix — `references/api-contracts.md` and acceptance criteria cite OpenAI-style `response_format: { type: 'json_object' }` for Anthropic calls

**Severity:** Medium. Drift-audit Phase-5 Medium-1.

## Root cause

Anthropic's `/v1/messages` endpoint does not accept a `response_format` parameter — that's OpenAI Chat Completions API syntax. The Phase-5 acceptance criteria for both 5.3 and 5.5 + the `references/api-contracts.md` `generate-lesson` server-side flow (line 107) all repeat the OpenAI-flavored phrasing. The actual code in `supabase/functions/generate-{feedback,lesson}/index.ts` correctly omits it and steers Claude to JSON via the system prompt — behavior is right, doc is wrong.

## Acceptance criteria

| # | Criterion |
| - | --------- |
| 1 | `references/api-contracts.md` line 107 (the `generate-lesson` flow's "Call Claude with…" step) is rewritten to describe the actual Anthropic invocation — `messages` with a system prompt that mandates JSON output + markdown-fence stripping at parse time. No mention of `response_format`. |
| 2 | The same correction is applied to the `generate-feedback` flow if it carries the same OpenAI-flavored language. |
| 3 | Future request-file authors can copy-paste the corrected phrasing without re-introducing the OpenAI artifact. |

## Files to touch

- `references/api-contracts.md`

## Out of scope

Editing Phase-5 request files in `requests/phase-5-ai-personalization/` — those are historical artifacts and don't get rewritten after merge.
