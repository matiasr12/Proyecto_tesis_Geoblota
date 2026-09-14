#!/bin/bash
# NO PROBADO EN UN MAC REAL — escrito segun la documentacion de launchd/LaunchAgents,
# pendiente de verificar en hardware macOS.
#
# Instala el tray como LaunchAgent por-usuario (NO LaunchDaemon: un LaunchDaemon corre
# como root sin sesion grafica y no puede mostrar iconos en la bandeja). Se ejecuta sin
# sudo porque solo afecta la sesion del usuario actual.
set -euo pipefail

TRAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_PATH="$TRAY_DIR/dist/mac/TesisTray.app"
EXECUTABLE="$APP_PATH/Contents/MacOS/TesisTray"
LABEL="cl.empresa.tesistray"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ ! -x "$EXECUTABLE" ]]; then
  echo "No se encontro $EXECUTABLE. Corre primero 'npm run build:mac' dentro de tray/." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${EXECUTABLE}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"

echo "LaunchAgent '${LABEL}' instalado. El tray se abrira automaticamente en el proximo login."
