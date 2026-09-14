#!/bin/bash
# NO PROBADO EN UN MAC REAL — ver nota en install-launchdaemon.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Este script necesita permisos de administrador. Volve a correrlo con: sudo $0" >&2
  exit 1
fi

LABEL="com.empresa.tesisdaemon"
PLIST_PATH="/Library/LaunchDaemons/${LABEL}.plist"

if [[ -f "$PLIST_PATH" ]]; then
  launchctl bootout system "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "LaunchDaemon '${LABEL}' desinstalado."
else
  echo "No hay un LaunchDaemon instalado en $PLIST_PATH."
fi
