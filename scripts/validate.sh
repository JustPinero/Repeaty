#!/usr/bin/env bash
# scripts/validate.sh — single source of truth for local + CI checks.
# CLAUDE.md's Validate step runs this. .github/workflows/ci.yml runs this.
# If you want CI to run something different, change THIS file — never let CI
# and local diverge.

set -euo pipefail

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." &> /dev/null && pwd )"
cd "$ROOT_DIR"

red()    { printf "\033[0;31m%s\033[0m\n" "$*"; }
green()  { printf "\033[0;32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[0;33m%s\033[0m\n" "$*"; }
section() { printf "\n\033[1;34m== %s ==\033[0m\n" "$*"; }

FAILED=()

run_step() {
  local label="$1"; shift
  section "$label"
  if "$@"; then
    green "✓ $label"
  else
    red "✗ $label"
    FAILED+=("$label")
  fi
}

# ─── 1. Lint (incl. a11y) ─────────────────────────────────────────────────────
if [ -f "package.json" ] && grep -q '"lint"' package.json 2>/dev/null; then
  run_step "lint (incl. jsx-a11y)" pnpm lint
else
  yellow "skip: lint — package.json not yet present (Phase 1.1 will scaffold)"
fi

# ─── 2. Type check ────────────────────────────────────────────────────────────
if [ -f "package.json" ] && grep -q '"typecheck"' package.json 2>/dev/null; then
  run_step "typecheck" pnpm typecheck
else
  yellow "skip: typecheck — package.json not yet present"
fi

# ─── 3. Unit tests ────────────────────────────────────────────────────────────
if [ -f "package.json" ] && grep -q '"test"' package.json 2>/dev/null; then
  run_step "unit tests (vitest)" pnpm test
else
  yellow "skip: unit tests — package.json not yet present"
fi

# ─── 4. E2E (only flows marked complete in e2e-manifest.json) ─────────────────
if [ -f "e2e-manifest.json" ] && command -v jq >/dev/null 2>&1; then
  COMPLETE_FLOWS=$(jq -r '.flows | to_entries[] | select(.value.status == "complete") | .key' e2e-manifest.json)
  if [ -n "$COMPLETE_FLOWS" ]; then
    section "e2e (applicable flows only)"
    while IFS= read -r flow; do
      [ -z "$flow" ] && continue
      yellow "→ would run: pnpm test:e2e --grep \"$flow\""
      # Wired up in Phase 6 once Playwright is installed; uncomment then:
      # run_step "e2e: $flow" pnpm test:e2e --grep "$flow"
    done <<< "$COMPLETE_FLOWS"
  else
    yellow "skip: e2e — no flows marked 'complete' in e2e-manifest.json yet"
  fi
fi

# ─── 5. Secret leak check ─────────────────────────────────────────────────────
section "secret leak check"
LEAKS=$(git grep -nE '(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})' \
  -- ':!*.lock' ':!references/' ':!*.md' ':!scripts/validate.sh' 2>/dev/null || true)
if [ -n "$LEAKS" ]; then
  red "✗ potential secrets found:"
  echo "$LEAKS"
  FAILED+=("secret-leak-check")
else
  green "✓ no secret patterns detected in tracked files"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
section "summary"
if [ ${#FAILED[@]} -eq 0 ]; then
  green "✅ all checks passed"
  exit 0
else
  red "❌ ${#FAILED[@]} check(s) failed:"
  for f in "${FAILED[@]}"; do echo "  - $f"; done
  exit 1
fi
