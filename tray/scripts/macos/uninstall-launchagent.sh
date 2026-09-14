#!/bin/bash
# NO PROBADO EN UN MAC REAL — ver nota en install-launchagent.sh
set -euo pipefail

LABEL="cl.empresa.tesistray"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ -f "$PLIST_PATH" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "LaunchAgent '${LABEL}' desinstalado."
else
  echo "No habia un LaunchAgent instalado en $PLIST_PATH."
fi
