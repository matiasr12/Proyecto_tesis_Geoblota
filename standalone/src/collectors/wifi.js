'use strict';

const { execFile } = require('child_process');

const EXEC_TIMEOUT_MS = 8000;
const MAC_PATTERN = /([0-9a-f]{2}:){5}[0-9a-f]{2}/i;
const PERCENT_PATTERN = /(\d{1,3})\s*%/;

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
 * Convierte la "calidad" de senal en % que reporta netsh/Windows a un
 * aproximado de RSSI en dBm, con la formula estandar usada por Android y la
 * mayoria de herramientas WiFi: dBm = (quality / 2) - 100.
 */
function qualityToDbm(quality) {
  return Math.round(quality / 2) - 100;
}

/**
 * Parsea la salida de "netsh wlan show networks mode=bssid" a una lista de
 * puntos de acceso con su BSSID y senal. "BSSID" no se traduce en ningun
 * idioma de Windows probado, pero se busca por formato de MAC en vez de por
 * etiqueta para no depender de eso; la senal se toma del primer "NN%" que
 * aparece en las lineas siguientes a cada BSSID.
 */
function parseWindowsNetworks(text) {
  const lines = text.split(/\r?\n/);
  const byBssid = new Map();
  let currentBssid = null;

  for (const line of lines) {
    const macMatch = line.match(MAC_PATTERN);
    if (macMatch) {
      currentBssid = macMatch[0].toLowerCase();
      continue;
    }
    const pctMatch = line.match(PERCENT_PATTERN);
    if (pctMatch && currentBssid && !byBssid.has(currentBssid)) {
      const quality = parseInt(pctMatch[1], 10);
      byBssid.set(currentBssid, { bssid: currentBssid, dBm: qualityToDbm(quality) });
      currentBssid = null;
    }
  }
  return Array.from(byBssid.values());
}

async function getWindowsAccessPoints() {
  const stdout = await execFileAsync('netsh', ['wlan', 'show', 'networks', 'mode=bssid']);
  return parseWindowsNetworks(stdout);
}

/**
 * Parsea la salida de "airport -s" (columnas SSID BSSID RSSI CHANNEL ...). El
 * RSSI ya viene en dBm ahi, sin necesidad de conversion.
 */
function parseAirportOutput(text) {
  const lines = text.split(/\r?\n/).slice(1); // primera linea es el encabezado
  const results = [];
  for (const line of lines) {
    const macMatch = line.match(MAC_PATTERN);
    if (!macMatch) continue;
    const rest = line.slice(macMatch.index + macMatch[0].length);
    const rssiMatch = rest.match(/-?\d+/);
    results.push({
      bssid: macMatch[0].toLowerCase(),
      dBm: rssiMatch ? parseInt(rssiMatch[0], 10) : null,
    });
  }
  return results;
}

async function getMacAccessPointsViaAirport() {
  const airportPath = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';
  const stdout = await execFileAsync(airportPath, ['-s']);
  return parseAirportOutput(stdout);
}

async function getMacAccessPointsViaSystemProfiler() {
  // Fallback cuando el binario "airport" no existe (removido en macOS recientes).
  // Solo entrega el BSSID de la red actualmente asociada, sin senal fiable --
  // macOS restringe el escaneo completo de redes cercanas a procesos con
  // autorizacion de Location Services, algo que un LaunchDaemon en segundo
  // plano no puede obtener sin un helper firmado con entitlement de
  // CoreLocation. Ver limitacion documentada en README del daemon.
  const stdout = await execFileAsync('system_profiler', ['SPAirPortDataType']);
  const macMatch = stdout.match(MAC_PATTERN);
  return macMatch ? [{ bssid: macMatch[0].toLowerCase(), dBm: null }] : [];
}

async function getMacAccessPoints() {
  try {
    return await getMacAccessPointsViaAirport();
  } catch {
    try {
      return await getMacAccessPointsViaSystemProfiler();
    } catch {
      return [];
    }
  }
}

/**
 * Devuelve los puntos de acceso WiFi visibles actualmente, con su BSSID y
 * senal aproximada en dBm (null si no se pudo determinar). Es la base para
 * resolver una ubicacion via una Geolocation API (ver ./geolocation.js).
 * En Windows requiere el servicio "WLAN AutoConfig" activo; si no lo esta, o
 * no hay adaptador WiFi, devuelve un arreglo vacio en vez de lanzar una
 * excepcion.
 * @returns {Promise<{bssid: string, dBm: number|null}[]>}
 */
async function getNearbyAccessPoints() {
  try {
    if (process.platform === 'win32') {
      return await getWindowsAccessPoints();
    }
    if (process.platform === 'darwin') {
      return await getMacAccessPoints();
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Devuelve solo los BSSID (compatibilidad con el matcheo contra BssidsArea
 * que hace el backend, que no necesita la senal).
 * @returns {Promise<string[]>}
 */
async function getNearbyBssids() {
  const accessPoints = await getNearbyAccessPoints();
  return accessPoints.map((ap) => ap.bssid);
}

module.exports = { getNearbyBssids, getNearbyAccessPoints };
