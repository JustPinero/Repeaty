#!/usr/bin/env bash
# Post-edit a11y lint, called from .claude/settings.json on PostToolUse(Write|Edit).
# Runs jsx-a11y on JSX/TSX files. Always exits 0 (advisory) — CI is the hard gate.
# Stdout is injected back into the conversation so violations are visible immediately.

set -u

FILE="${1:-${CLAUDE_TOOL_FILE_PATH:-}}"
[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0

case "$FILE" in
  *.tsx|*.jsx)
    if command -v pnpm >/dev/null 2>&1 && [ -f "package.json" ] && grep -q "eslint" package.json 2>/dev/null; then
      OUTPUT=$(pnpm exec eslint "$FILE" 2>&1 || true)
      if echo "$OUTPUT" | grep -qE "(jsx-a11y|axe)" 2>/dev/null; then
        echo "⚠️  a11y lint flagged issues in $FILE — fix before commit:"
        echo "$OUTPUT" | grep -E "(jsx-a11y|axe|warning|error)" | head -20
      fi
    fi
    ;;
  *) ;;
esac

exit 0
