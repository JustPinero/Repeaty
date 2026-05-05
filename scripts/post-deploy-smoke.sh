#!/usr/bin/env bash
#
# post-deploy-smoke.sh — verify a production deploy answers correctly.
# Hits the Vercel frontend + every Supabase Edge Function and asserts the
# basic shape of each response. Run after every `vercel --prod`.
#
# Usage:
#   bash scripts/post-deploy-smoke.sh                            # defaults below
#   bash scripts/post-deploy-smoke.sh <vercel-url> <fn-url>      # override both
#
# Defaults match the v1 production deploy.
set -euo pipefail

URL="${1:-https://repeaty.vercel.app}"
FN_URL="${2:-https://pvoupsduyymykawlmhpu.supabase.co/functions/v1}"

OK="\033[0;32m✓\033[0m"
ERR="\033[0;31m✗\033[0m"
fail() { printf "${ERR} %s\n" "$1"; exit 1; }
pass() { printf "${OK} %s\n" "$1"; }

command -v jq >/dev/null || fail "jq is required"

echo "── Frontend (${URL}) ──"
for path in "" "/login" "/signup" "/app"; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "${URL}${path}" || true)
  [ "$code" = "200" ] || fail "${URL}${path} → ${code} (expected 200)"
  pass "${URL}${path:-/} → 200"
done

manifest=$(curl -sS --max-time 10 "${URL}/manifest.webmanifest" || true)
echo "$manifest" | jq -e '.name == "Repeaty"' >/dev/null \
  || fail "manifest.webmanifest body did not match (.name == \"Repeaty\")"
pass "manifest.webmanifest body OK"

manifest_ct=$(curl -sSI --max-time 10 "${URL}/manifest.webmanifest" | awk -v IGNORECASE=1 -F': ' '/^content-type:/ {print $2}' | tr -d '\r\n ')
case "$manifest_ct" in
  application/manifest+json*) pass "manifest.webmanifest Content-Type OK" ;;
  *) fail "manifest.webmanifest Content-Type was \"${manifest_ct}\" (expected application/manifest+json)" ;;
esac

sw_cc=$(curl -sSI --max-time 10 "${URL}/sw.js" | awk -v IGNORECASE=1 -F': ' '/^cache-control:/ {print $2}' | tr -d '\r\n')
case "$sw_cc" in
  *must-revalidate*) pass "sw.js Cache-Control includes must-revalidate" ;;
  *) fail "sw.js Cache-Control was \"${sw_cc}\" (expected must-revalidate)" ;;
esac

echo
echo "── Edge Functions (${FN_URL}) ──"
for fn in flip-tier score-pronunciation generate-feedback generate-lesson tts-jazh audio-retention; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' --max-time 15 "${FN_URL}/${fn}" || true)
  [ "$code" = "401" ] || fail "${fn} unauth POST → ${code} (expected 401)"
  pass "${fn} → 401 (gate live)"
done

echo
pass "all smoke checks passed"
