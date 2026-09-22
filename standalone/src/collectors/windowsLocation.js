'use strict';

const { execFile } = require('child_process');

const EXEC_TIMEOUT_MS = 12000;
const WATCHER_MAX_WAIT_SECONDS = 10;

// System.Device.Location es la API nativa de Windows para el servicio de
// ubicacion del sistema: internamente usa la base de datos de posicionamiento
// WiFi de Microsoft (o GPS si el equipo lo tiene), la misma que usa cualquier
// app de Windows con permiso de ubicacion. No requiere API key ni cuenta.
const PS_SCRIPT = `
Add-Type -AssemblyName System.Device
$watcher = New-Object System.Device.Location.GeoCoordinateWatcher
$watcher.Start()
$count = 0
while ($watcher.Status -ne 'Ready' -and $watcher.Permission -ne 'Denied' -and $count -lt ${WATCHER_MAX_WAIT_SECONDS}) {
    Start-Sleep -Seconds 1
    $count++
}
if ($watcher.Permission -eq 'Denied' -or $watcher.Position.Location.IsUnknown) {
    Write-Output 'NULL'
} else {
    $loc = $watcher.Position.Location
    Write-Output "$($loc.Latitude)|$($loc.Longitude)|$($loc.HorizontalAccuracy)"
}
$watcher.Stop()
`;

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: EXEC_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Resuelve lat/long usando el servicio de ubicacion nativo de Windows. No
 * requiere API key, cuenta ni billing -- viene incluido en el sistema
 * operativo. Requiere que "Ubicacion" este activada en Configuracion >
 * Privacidad y seguridad del equipo; si esta desactivada, o no hay fix
 * disponible (sin GPS/WiFi/IP resoluble), devuelve null.
 * @returns {Promise<{latitud: number, longitud: number, precisionMetros: number|null}|null>}
 */
async function resolveWindowsLocation() {
  if (process.platform !== 'win32') return null;

  try {
    const stdout = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT]);
    const line = stdout.trim().split(/\r?\n/).pop();
    if (!line || line === 'NULL') return null;

    const [lat, lon, accuracy] = line.split('|').map(Number);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

    return {
      latitud: lat,
      longitud: lon,
      precisionMetros: Number.isNaN(accuracy) ? null : accuracy,
    };
  } catch {
    return null;
  }
}

module.exports = { resolveWindowsLocation };
