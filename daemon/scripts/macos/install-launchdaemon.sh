#!/bin/bash
# NO PROBADO EN UN MAC REAL — escrito segun la documentacion de launchd/LaunchDaemons,
# pendiente de verificar en hardware macOS antes de usarlo en produccion.
#
# Instala el daemon como LaunchDaemon (corre como root, sin sesion de usuario, arranca
# con el sistema). El tray (interfaz visible) es un proceso APARTE que debe instalarse
# como LaunchAgent (ver ../../../tray/scripts/macos/), porque un LaunchDaemon no tiene
# acceso a la sesion grafica y no puede mostrar un icono en la bandeja.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Este script necesita permisos de administrador. Volve a correrlo con: sudo $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
LABEL="com.empresa.tesisdaemon"
PLIST_PATH="/Library/LaunchDaemons/${LABEL}.plist"
LOG_DIR="/Library/Logs/TesisDaemon"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No se encontro $ENV_FILE. Copia .env.example a .env y completa SERVER_URL, JWT_TOKEN y DB_ENCRYPTION_KEY." >&2
  exit 1
fi

NODE_PATH="$(command -v node || true)"
if [[ -z "$NODE_PATH" ]]; then
  echo "No se encontro 'node' en el PATH. Instala Node.js >= 22 (requerido por node:sqlite) antes de continuar." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

# Arma el bloque EnvironmentVariables del plist a partir del .env, ignorando comentarios y lineas vacias.
ENV_XML=""
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  value="${value%\"}"
  value="${value#\"}"
  ENV_XML="${ENV_XML}    <key>${key}</key>\n    <string>${value}</string>\n"
done < "$ENV_FILE"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${SCRIPT_DIR}/src/index.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/daemon.error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
$(echo -e "$ENV_XML")
  </dict>
</dict>
</plist>
EOF

chown root:wheel "$PLIST_PATH"
chmod 600 "$PLIST_PATH"

launchctl bootstrap system "$PLIST_PATH"

echo "LaunchDaemon '${LABEL}' instalado y arrancado. Logs en ${LOG_DIR}/"
