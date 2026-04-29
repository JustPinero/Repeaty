#!/usr/bin/env bash
# Verify working state, called from .claude/settings.json on UserPromptSubmit.
# When the prompt looks like the start of a new request (PRIME / new request file),
# run the test suite and inject a warning into context if tests fail.
#
# Always exits 0 — this is advisory, not blocking. The model decides what to do
# with a "tests failing" signal.

set -u

PROMPT="${CLAUDE_USER_PROMPT:-}"

# Only fire on prompts that look like priming a new request. Keep the check broad
# but cheap — running tests on every keystroke would be punishing.
should_run=0
case "$PROMPT" in
  *"prime for"*|*"PRIME"*|*"start request"*|*"requests/phase-"*|*"new request"*)
    should_run=1
    ;;
esac

[ "$should_run" -eq 0 ] && exit 0

# If no package.json yet, nothing to validate (we're pre-Phase-1.1).
[ ! -f "package.json" ] && exit 0

# Run the full validate script silently; report only if it failed.
if ! bash scripts/validate.sh >/tmp/repeaty-validate.log 2>&1; then
  echo "⚠️  WARNING: validate.sh is currently failing on main."
  echo "   Tail of failure:"
  tail -30 /tmp/repeaty-validate.log
  echo "   Fix existing failures before starting a new request, or you'll build on broken."
fi

exit 0
