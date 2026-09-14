'use strict';

const os = require('os');

const VIRTUAL_ADAPTER_HINTS = /virtual|vmware|virtualbox|hyper-v|vethernet|docker|tailscale|loopback/i;

/**
 * Devuelve la IP local mas representativa del equipo (IPv4, no interna).
 * Si hay varias, prioriza adaptadores fisicos por sobre los que parecen virtuales
 * (VPN, VMs, contenedores) segun el nombre de la interfaz.
 * @returns {string|null}
 */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!addresses) continue;
    for (const addr of addresses) {
      if (addr.family === 'IPv4' && !addr.internal) {
        candidates.push({ name, address: addr.address });
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const aVirtual = VIRTUAL_ADAPTER_HINTS.test(a.name) ? 1 : 0;
    const bVirtual = VIRTUAL_ADAPTER_HINTS.test(b.name) ? 1 : 0;
    return aVirtual - bVirtual;
  });

  return candidates[0].address;
}

module.exports = { getLocalIp };
