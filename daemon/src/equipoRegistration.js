'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Datos de Faena/Area/Persona que el tray guarda en equipo-info.json (misma
 * carpeta DAEMON_DATA_DIR que status.json). El daemon los lee, los manda una
 * sola vez al backend, y marca el archivo como enviado para no repetirlo.
 */
function getEquipoInfoPath(dataDir) {
  return path.join(dataDir, 'equipo-info.json');
}

function readPendingEquipoInfo(dataDir) {
  try {
    const data = JSON.parse(fs.readFileSync(getEquipoInfoPath(dataDir), 'utf8'));
    return data.sent ? null : data;
  } catch {
    return null;
  }
}

function markEquipoInfoSent(dataDir, data) {
  const payload = { ...data, sent: true };
  fs.writeFileSync(getEquipoInfoPath(dataDir), JSON.stringify(payload, null, 2), 'utf8');
}

module.exports = { readPendingEquipoInfo, markEquipoInfoSent };
