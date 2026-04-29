#!/usr/bin/env bash
# scripts/validate-env.sh — verify required env vars are set for the target environment.
# Called by /pre-deploy. Usage: bash scripts/validate-env.sh [local|preview|production]

set -euo pipefail

ENV="${1:-local}"
echo "validating env vars for: $ENV"

REQUIRED_CLIENT=(
  "VITE_SUPABASE_URL"
  "VITE_SUPABASE_ANON_KEY"
)

REQUIRED_SERVER=(
  "SUPABASE_SERVICE_ROLE_KEY"
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
)

MISSING=()
WRONG_SCOPE=()

check_var() {
  local var="$1"
  local scope="$2" # client | server
  local value="${!var:-}"

  if [ -z "$value" ]; then
    MISSING+=("$var ($scope)")
    return
  fi

  # A server key under a VITE_-prefixed env var is a CRITICAL misconfiguration.
  if [ "$scope" = "server" ] && [[ "$var" == VITE_* ]]; then
    WRONG_SCOPE+=("$var should NOT be VITE_-prefixed — it would leak to the browser bundle")
  fi
}

for v in "${REQUIRED_CLIENT[@]}"; do check_var "$v" client; done
for v in "${REQUIRED_SERVER[@]}"; do check_var "$v" server; done

# For local, server vars usually aren't in the shell — that's expected;
# they're set as Supabase secrets. Soft-warn instead of hard-fail.
if [ "$ENV" = "local" ]; then
  echo "note: in local mode, server-side keys are typically set via 'supabase secrets set' — not the shell."
fi

echo
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ MISSING:"
  for m in "${MISSING[@]}"; do echo "  - $m"; done
fi

if [ ${#WRONG_SCOPE[@]} -gt 0 ]; then
  echo "🚨 WRONG SCOPE (security):"
  for w in "${WRONG_SCOPE[@]}"; do echo "  - $w"; done
fi

if [ ${#MISSING[@]} -eq 0 ] && [ ${#WRONG_SCOPE[@]} -eq 0 ]; then
  echo "✅ all env vars present and correctly scoped"
  exit 0
fi

# Hard-fail on wrong scope always; missing fails for non-local envs.
if [ ${#WRONG_SCOPE[@]} -gt 0 ]; then exit 1; fi
if [ "$ENV" != "local" ] && [ ${#MISSING[@]} -gt 0 ]; then exit 1; fi
exit 0
