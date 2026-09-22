'use strict';

const { execFile } = require('child_process');

const EXEC_TIMEOUT_MS = 5000;

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: EXEC_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

const MEDIA_TYPE_MAP = {
  'Native 802.11': 'wifi',
  '802.3': 'ethernet',
  'Wireless WAN': 'movil',
};

/**
 * Determina el tipo de conexion (wifi/ethernet/movil) mirando el adaptador
 * de red que tiene la ruta por defecto -- el que realmente se usa para salir
 * a internet, no cualquier adaptador presente en el equipo. Sirve para no
 * generar falsas alertas de geofencing cuando el equipo esta fuera de la
 * faena usando datos moviles en vez de el WiFi conocido.
 * @returns {Promise<'wifi'|'ethernet'|'movil'|'desconocido'>}
 */
async function getConnectionType() {
  if (process.platform !== 'win32') {
    return 'desconocido';
  }

  try {
    const stdout = await execFileAsync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop | " +
        'Sort-Object -Property RouteMetric | Select-Object -First 1; ' +
        '(Get-NetAdapter -InterfaceIndex $route.InterfaceIndex).PhysicalMediaType',
    ]);
    return MEDIA_TYPE_MAP[stdout.trim()] || 'desconocido';
  } catch {
    return 'desconocido';
  }
}

module.exports = { getConnectionType };
