'use strict';

const { getComputerName } = require('./computerName');
const { getNearbyBssids } = require('./wifi');
const { getLocalIp } = require('./network');

/**
 * Junta los cuatro datos del registro periodico: nombre del equipo (AD o fallback),
 * BSSIDs de WiFi cercanas, IP local y hora del registro (ISO 8601, UTC).
 * @returns {Promise<{computerName: string, bssids: string[], ip: string|null, timestamp: string}>}
 */
async function collectSnapshot() {
  const [nameInfo, bssids, ip] = await Promise.all([
    getComputerName(),
    getNearbyBssids(),
    Promise.resolve(getLocalIp()),
  ]);

  return {
    computerName: nameInfo.computerName,
    bssids,
    ip,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { collectSnapshot, getComputerName, getNearbyBssids, getLocalIp };
