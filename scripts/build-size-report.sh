#!/usr/bin/env bash
#
# Bundle-size report for the apps/web production build. Fails the calling
# process when the gzipped main bundle exceeds the 500 KB ceiling per
# `references/deployment-landmines.md`.

set -euo pipefail

CEILING_KB=500
DIST="apps/web/dist/assets"

if [ ! -d "$DIST" ]; then
  echo "❌ $DIST not found — run \`pnpm --filter @repeaty/web build\` first."
  exit 1
fi

echo "== bundle-size report =="

total_gz=0
for f in "$DIST"/*.js; do
  [ -f "$f" ] || continue
  gz=$(gzip -c "$f" | wc -c | tr -d ' ')
  size_kb=$((gz / 1024))
  printf "  %s  %d KB gz\n" "$(basename "$f")" "$size_kb"
  total_gz=$((total_gz + gz))
done

total_kb=$((total_gz / 1024))
echo
echo "  total .js gz: $total_kb KB (ceiling: $CEILING_KB KB)"

if [ "$total_kb" -gt "$CEILING_KB" ]; then
  echo "❌ bundle over budget: $total_kb KB > $CEILING_KB KB"
  exit 1
fi
echo "✓ within budget"
