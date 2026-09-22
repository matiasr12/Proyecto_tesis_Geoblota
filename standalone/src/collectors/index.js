'use strict';

const { getComputerName } = require('./computerName');
const { getNearbyBssids } = require('./wifi');
const { getLocalIp } = require('./network');
const { getConnectionType } = require('./connectionType');

/**
 * Junta los datos del registro periodico: nombre del equipo (AD o fallback),
 * BSSIDs de WiFi cercanas, IP local, tipo de conexion activa (wifi/ethernet/
 * movil) y hora del registro (ISO 8601, UTC).
 * @returns {Promise<{computerName: string, bssids: string[], ip: string|null, connectionType: string, timestamp: string}>}
 */
async function collectSnapshot() {
  const [nameInfo, bssids, ip, connectionType] = await Promise.all([
    getComputerName(),
    getNearbyBssids(),
    Promise.resolve(getLocalIp()),
    getConnectionType(),
  ]);

  return {
    computerName: nameInfo.computerName,
    bssids,
    ip,
    connectionType,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { collectSnapshot, getComputerName, getNearbyBssids, getLocalIp, getConnectionType };
