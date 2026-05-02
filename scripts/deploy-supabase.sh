#!/usr/bin/env bash
#
# deploy-supabase.sh — deploy migrations + every Edge Function to the
# linked Supabase Cloud project. Idempotent. Run after `supabase link`.
#
# Usage:
#   bash scripts/deploy-supabase.sh                    # everything (db + fns)
#   bash scripts/deploy-supabase.sh --functions-only   # skip db push
#   bash scripts/deploy-supabase.sh --db-only          # skip fn deploys
#
# Requires:
#   - `supabase link --project-ref <ref>` already done
#   - $DB_PASSWORD env or you'll be prompted

set -euo pipefail

WITH_DB=1
WITH_FUNCTIONS=1
for arg in "$@"; do
  case "$arg" in
    --functions-only) WITH_DB=0 ;;
    --db-only)        WITH_FUNCTIONS=0 ;;
    -h|--help)
      sed -n '2,/^set -euo pipefail/p' "$0" | sed 's/^# \?//;s/^#$//' | grep -v 'set -euo'
      exit 0
      ;;
    *) echo "❌ unknown flag: $arg"; exit 2 ;;
  esac
done

# Repo-root awareness.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Color helpers.
BOLD="\033[1m"; OK="\033[0;32m"; WARN="\033[0;33m"; ERR="\033[0;31m"; RESET="\033[0m"
section() { printf "\n${BOLD}== %s ==${RESET}\n" "$1"; }
ok()      { printf "${OK}✓${RESET} %s\n" "$1"; }
warn()    { printf "${WARN}⚠${RESET} %s\n" "$1"; }
fail()    { printf "${ERR}✗${RESET} %s\n" "$1"; exit 1; }

command -v supabase >/dev/null || fail "supabase CLI not found"

# ── Migrations ───────────────────────────────────────────────────────────────
if [ "$WITH_DB" = "1" ]; then
  section "migrations"
  if [ -n "${DB_PASSWORD:-}" ]; then
    supabase db push --password "$DB_PASSWORD"
  else
    supabase db push
  fi
  ok "migrations applied"
fi

# ── Edge Functions ───────────────────────────────────────────────────────────
if [ "$WITH_FUNCTIONS" = "1" ]; then
  section "edge functions"
  shopt -s nullglob
  for d in supabase/functions/*/; do
    name="$(basename "$d")"
    [ "$name" = "_shared" ] && continue
    [ -f "$d/index.ts" ] || continue
    echo "deploying $name…"
    supabase functions deploy "$name"
    ok "$name"
  done
fi

# ── Secrets check ────────────────────────────────────────────────────────────
section "secrets"
SECRETS="$(supabase secrets list 2>&1 || true)"
required=(OPENAI_API_KEY ANTHROPIC_API_KEY SUPABASE_SERVICE_ROLE_KEY)
missing=()
for k in "${required[@]}"; do
  if ! echo "$SECRETS" | grep -q "$k"; then
    missing+=("$k")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  warn "missing secrets: ${missing[*]}"
  cat <<'EOF'

  Set them with:
    supabase secrets set \
      OPENAI_API_KEY=sk-... \
      ANTHROPIC_API_KEY=sk-ant-... \
      SUPABASE_SERVICE_ROLE_KEY=<from-cloud-dashboard-API-settings>

  Until set:
    - score-pronunciation, generate-feedback, generate-lesson, tts-jazh
      will return 500 INTERNAL.
    - Free-tier UX (review + comprehension + non-Pro pronunciation upload
      attempt) is unaffected.
EOF
else
  ok "all required secrets present"
fi

# ── Audio-retention cron ─────────────────────────────────────────────────────
section "audio-retention cron (manual)"
warn "configure in Supabase Dashboard → Database → Cron:"
echo "  Name:     audio-retention-blob-cleanup"
echo "  Schedule: 30 3 * * *  (daily 03:30 UTC)"
echo "  SQL:      select net.http_post("
echo "              url := 'https://<project-ref>.supabase.co/functions/v1/audio-retention',"
echo "              headers := jsonb_build_object('apikey', '<service-role-key>', 'Content-Type', 'application/json')"
echo "            );"
echo "  (Requires pg_net extension — enable from Database → Extensions if not already.)"

ok "deploy complete"
