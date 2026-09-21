'use strict';

const { execFile } = require('child_process');

const EXEC_TIMEOUT_MS = 8000;
const BSSID_PATTERN = /(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/gi;

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

function extractBssids(text) {
  const matches = text.match(BSSID_PATTERN) || [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

async function getWindowsBssids() {
  // "BSSID" no se traduce en la salida de netsh en ningun idioma de Windows probado,
  // pero se extrae por formato de MAC en vez de por etiqueta para no depender de eso.
  const stdout = await execFileAsync('netsh', ['wlan', 'show', 'networks', 'mode=bssid']);
  return extractBssids(stdout);
}

async function getMacBssidsViaAirport() {
  const airportPath = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';
  const stdout = await execFileAsync(airportPath, ['-s']);
  return extractBssids(stdout);
}

async function getMacBssidsViaSystemProfiler() {
  // Fallback cuando el binario "airport" no existe (removido en macOS recientes).
  // Solo entrega el BSSID de la red actualmente asociada: macOS restringe el escaneo
  // completo de redes cercanas a procesos con autorizacion de Location Services,
  // algo que un LaunchDaemon en segundo plano no puede obtener sin un helper firmado
  // con entitlement de CoreLocation. Ver limitacion documentada en README del daemon.
  const stdout = await execFileAsync('system_profiler', ['SPAirPortDataType']);
  return extractBssids(stdout);
}

async function getMacBssids() {
  try {
    return await getMacBssidsViaAirport();
  } catch {
    try {
      return await getMacBssidsViaSystemProfiler();
    } catch {
      return [];
    }
  }
}

/**
 * Devuelve los BSSID de las redes WiFi visibles actualmente.
 * En Windows requiere el servicio "WLAN AutoConfig" activo; si no lo esta, o no hay
 * adaptador WiFi, devuelve un arreglo vacio en vez de lanzar una excepcion.
 * En macOS moderno (sin el binario "airport") solo puede obtenerse el BSSID de la red
 * conectada actualmente, no el listado completo de redes cercanas (ver nota arriba).
 * @returns {Promise<string[]>}
 */
async function getNearbyBssids() {
  try {
    if (process.platform === 'win32') {
      return await getWindowsBssids();
    }
    if (process.platform === 'darwin') {
      return await getMacBssids();
    }
  } catch {
    return [];
  }
  return [];
}

module.exports = { getNearbyBssids };
