'use strict';

const { getComputerName } = require('./computerName');
const { getNearbyBssids, getNearbyAccessPoints } = require('./wifi');
const { getLocalIp } = require('./network');
const { getConnectionType } = require('./connectionType');
const { resolveLocation } = require('./geolocation');
const { resolveWindowsLocation } = require('./windowsLocation');

/**
 * Junta los datos del registro periodico: nombre del equipo (AD o fallback),
 * BSSIDs de WiFi cercanas, IP local, tipo de conexion activa (wifi/ethernet/
 * movil), ubicacion aproximada y hora del registro (ISO 8601, UTC).
 *
 * La ubicacion se resuelve en dos pasos: primero el servicio de ubicacion
 * nativo de Windows (gratis, sin API key, usa la base de posicionamiento de
 * Microsoft); si no esta disponible (no es Windows, "Ubicacion" desactivada,
 * o sin fix), y hay una API key de Google Geolocation configurada, se intenta
 * con el WiFi visible como respaldo. Si ninguna resuelve, lat/long quedan null.
 * @param {{googleGeolocationApiKey?: string|null}} [config]
 * @returns {Promise<{computerName: string, bssids: string[], ip: string|null, connectionType: string, latitud: number|null, longitud: number|null, precisionMetros: number|null, timestamp: string}>}
 */
async function collectSnapshot(config) {
  const [nameInfo, accessPoints, ip, connectionType] = await Promise.all([
    getComputerName(),
    getNearbyAccessPoints(),
    Promise.resolve(getLocalIp()),
    getConnectionType(),
  ]);

  let location = await resolveWindowsLocation();
  if (!location) {
    location = await resolveLocation(accessPoints, config && config.googleGeolocationApiKey);
  }

  return {
    computerName: nameInfo.computerName,
    bssids: accessPoints.map((ap) => ap.bssid),
    ip,
    connectionType,
    latitud: location ? location.latitud : null,
    longitud: location ? location.longitud : null,
    precisionMetros: location ? location.precisionMetros : null,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  collectSnapshot,
  getComputerName,
  getNearbyBssids,
  getNearbyAccessPoints,
  getLocalIp,
  getConnectionType,
};
