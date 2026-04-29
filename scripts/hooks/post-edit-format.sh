#!/usr/bin/env bash
# Post-edit formatter, called from .claude/settings.json on PostToolUse(Write|Edit).
# Runs Prettier on the just-edited file when applicable. Stays soft (exit 0 always)
# so a formatting hiccup doesn't block work — formatting also runs in CI as a hard gate.

set -u

FILE="${1:-${CLAUDE_TOOL_FILE_PATH:-}}"
[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.css|*.html|*.yml|*.yaml)
    if command -v pnpm >/dev/null 2>&1 && [ -f "package.json" ]; then
      pnpm exec prettier --write "$FILE" >/dev/null 2>&1 || true
    fi
    ;;
  *) ;;
esac

exit 0
