#!/usr/bin/env bash
#
# dev-up.sh — one-shot local spin-up for Repeaty.
#
# Verifies the toolchain, installs deps, starts Supabase if it isn't
# already, resets the DB to a clean schema, and launches the Vite dev
# server. Prints all the URLs you need at the end.
#
# Usage:
#   bash scripts/dev-up.sh                    # free-tier surface only
#   bash scripts/dev-up.sh --with-functions   # also start `supabase functions serve`
#                                              for Pro-tier features (admin /
#                                              generate-lesson / generate-feedback /
#                                              tts-jazh / score-pronunciation)
#   bash scripts/dev-up.sh --reset            # supabase db reset (lose any local data)
#   bash scripts/dev-up.sh --no-dev           # skip the Vite dev server
#                                              (useful when you want supabase
#                                              up but the dev server in another
#                                              terminal)
#
# Tested against:
#   pnpm 9.15+
#   supabase CLI 2.95+
#   docker desktop 29+
#   node 22 (for parity with CI)

set -euo pipefail

WITH_FUNCTIONS=0
WITH_RESET=0
WITH_DEV=1
for arg in "$@"; do
  case "$arg" in
    --with-functions) WITH_FUNCTIONS=1 ;;
    --reset)          WITH_RESET=1 ;;
    --no-dev)         WITH_DEV=0 ;;
    -h|--help)
      sed -n '2,/^set -euo pipefail/p' "$0" | sed 's/^# \?//;s/^#$//' | grep -v 'set -euo'
      exit 0
      ;;
    *)
      echo "❌ unknown flag: $arg (try --help)"; exit 2 ;;
  esac
done

# ── Color helpers ─────────────────────────────────────────────────────────────
BOLD="\033[1m"; DIM="\033[2m"; OK="\033[0;32m"; WARN="\033[0;33m"; ERR="\033[0;31m"; RESET="\033[0m"
section() { printf "\n${BOLD}== %s ==${RESET}\n" "$1"; }
ok()      { printf "${OK}✓${RESET} %s\n" "$1"; }
warn()    { printf "${WARN}⚠${RESET} %s\n" "$1"; }
fail()    { printf "${ERR}✗${RESET} %s\n" "$1"; exit 1; }

# Repo-root awareness — run from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ── Toolchain check ──────────────────────────────────────────────────────────
section "toolchain"

command -v pnpm >/dev/null     || fail "pnpm not found. Install via: brew install pnpm  (or: npm i -g pnpm)"
command -v supabase >/dev/null || fail "supabase CLI not found. Install via: brew install supabase/tap/supabase"
command -v docker >/dev/null   || fail "docker not found. Install Docker Desktop and ensure it's running."

if ! docker info >/dev/null 2>&1; then
  fail "docker daemon not reachable. Start Docker Desktop and retry."
fi

ok "pnpm:     $(pnpm --version)"
ok "supabase: $(supabase --version | head -1)"
ok "docker:   $(docker --version | awk '{print $3}' | tr -d ',')"

# ── pnpm install ─────────────────────────────────────────────────────────────
section "install"
if [ ! -d node_modules ] || [ "package.json" -nt node_modules ]; then
  pnpm install --frozen-lockfile
  ok "deps installed"
else
  ok "deps already installed (skip)"
fi

# ── Local Supabase ───────────────────────────────────────────────────────────
section "supabase"

# `supabase status` exits non-zero when nothing is running; suppress.
if supabase status >/dev/null 2>&1; then
  ok "supabase already running"
else
  echo "starting supabase (this can take a minute on first run)…"
  supabase start
  ok "supabase started"
fi

if [ "$WITH_RESET" = "1" ]; then
  echo "resetting db…"
  supabase db reset --no-seed
  ok "db reset (migrations 0001..0020 applied)"
else
  warn "skipping db reset (pass --reset to apply fresh migrations)"
fi

# ── Env file ─────────────────────────────────────────────────────────────────
section "env"

ENV_FILE="apps/web/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  SUPA_URL="$(supabase status -o env | awk -F= '/^API_URL=/{print $2}' | tr -d '"')"
  SUPA_ANON="$(supabase status -o env | awk -F= '/^ANON_KEY=/{print $2}' | tr -d '"')"
  cat >"$ENV_FILE" <<EOF
VITE_SUPABASE_URL=$SUPA_URL
VITE_SUPABASE_ANON_KEY=$SUPA_ANON
EOF
  ok "wrote $ENV_FILE"
else
  ok "$ENV_FILE exists (not overwriting — delete it manually if Supabase URL drifted)"
fi

# ── Optional: edge functions ─────────────────────────────────────────────────
if [ "$WITH_FUNCTIONS" = "1" ]; then
  section "edge functions"
  if [ ! -f supabase/.env ]; then
    warn "supabase/.env not found — Edge Functions need OPENAI_API_KEY + ANTHROPIC_API_KEY."
    cat <<'EOF'
  Create it manually:
    echo "OPENAI_API_KEY=sk-..." > supabase/.env
    echo "ANTHROPIC_API_KEY=sk-ant-..." >> supabase/.env
    echo "SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | awk -F= '/^SERVICE_ROLE_KEY=/{print $2}' | tr -d '\"')" >> supabase/.env
EOF
    warn "skipping `supabase functions serve` (no env)"
  else
    ok "supabase/.env present"
    echo "starting Edge Functions in background…"
    supabase functions serve >/tmp/repeaty-functions.log 2>&1 &
    FN_PID=$!
    sleep 2
    if kill -0 "$FN_PID" 2>/dev/null; then
      ok "edge functions running (pid $FN_PID, log: /tmp/repeaty-functions.log)"
    else
      warn "edge functions failed to start; tail /tmp/repeaty-functions.log"
    fi
  fi
fi

# ── Status URLs ──────────────────────────────────────────────────────────────
section "urls"
SUPA_URL="$(supabase status -o env | awk -F= '/^API_URL=/{print $2}' | tr -d '"')"
SUPA_STUDIO="$(supabase status -o env | awk -F= '/^STUDIO_URL=/{print $2}' | tr -d '"')"
SUPA_INBUCKET="$(supabase status -o env | awk -F= '/^INBUCKET_URL=/{print $2}' | tr -d '"')"

printf "  ${BOLD}Repeaty:${RESET}     http://localhost:5173        ${DIM}(once dev server is up)${RESET}\n"
printf "  ${BOLD}Studio:${RESET}      %s\n" "$SUPA_STUDIO"
printf "  ${BOLD}Inbucket:${RESET}    %s        ${DIM}(catches signup-confirmation emails)${RESET}\n" "$SUPA_INBUCKET"
printf "  ${BOLD}Postgres:${RESET}    %s\n" "$SUPA_URL"

# ── Vite dev server ──────────────────────────────────────────────────────────
if [ "$WITH_DEV" = "1" ]; then
  section "dev server"
  echo "starting Vite — Ctrl-C to quit (Supabase keeps running)…"
  exec pnpm --filter @repeaty/web dev
else
  warn "skipping Vite (pass without --no-dev to start it)."
  echo "Run manually: pnpm --filter @repeaty/web dev"
fi
