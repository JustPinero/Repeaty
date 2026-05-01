/**
 * Strip ``` and ```json fences before JSON.parse. Canonical home for the
 * helper used by every Claude-output parser in the repo (feedback-prompt,
 * lesson-prompt, future Edge Functions). Pure TS; safe to import from both
 * Node (apps/web type-checks) and Deno (Edge Functions, via relative path).
 */

export function stripFence(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}
