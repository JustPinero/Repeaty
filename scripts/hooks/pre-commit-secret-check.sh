#!/usr/bin/env bash
# Pre-commit secret check, called from .claude/settings.json on PreToolUse(Bash).
# Only runs when the bash command being attempted contains "git commit".
# Exit 1 to block the tool call if secrets are detected in staged changes.

set -euo pipefail

CMD="${CLAUDE_TOOL_INPUT_COMMAND:-}"

# Bail unless this is a git commit attempt
case "$CMD" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# Look for known secret patterns in staged content.
PATTERNS='(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|PRIVATE) KEY-----)'

LEAKS=$(git diff --cached --no-color | grep -nE "$PATTERNS" || true)

# Also block staging of anything that looks like a real .env file
ENV_FILES=$(git diff --cached --name-only | grep -E '(^|/)\.env($|\.local$|\..+)?$' | grep -vE '\.example$' || true)

if [ -n "$LEAKS" ] || [ -n "$ENV_FILES" ]; then
  echo "🚨 BLOCKED: pre-commit secret check failed" >&2
  [ -n "$LEAKS" ] && { echo "Secret patterns detected in staged diff:" >&2; echo "$LEAKS" >&2; }
  [ -n "$ENV_FILES" ] && { echo "Refusing to commit env files:" >&2; echo "$ENV_FILES" >&2; }
  echo "If this is a false positive, sanitize the diff and retry." >&2
  exit 1
fi

exit 0
