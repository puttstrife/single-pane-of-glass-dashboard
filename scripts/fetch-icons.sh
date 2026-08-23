#!/usr/bin/env bash
# Refetches the Lucide icons the dashboard uses and regenerates assets/icons.js.
# Icons are inlined because the published page runs under a CSP that blocks CDNs.
set -euo pipefail
ICONS=(chevron-down globe layout-template message-circle circle-check-big
       triangle-alert octagon-alert user settings log-out table arrow-up
       arrow-down minus external-link rows-2 rows-3 activity search bell)
DIR="$(mktemp -d)"
for i in "${ICONS[@]}"; do
  curl -sSL --max-time 15 -o "$DIR/$i.svg" "https://unpkg.com/lucide-static@latest/icons/$i.svg"
done
echo "Downloaded ${#ICONS[@]} icons to $DIR — rerun the generator in the README to rebuild assets/icons.js"
