'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Datos de Faena/Area/Persona que la ventana de registro guarda en
 * equipo-info.json (misma carpeta de datos que la cola local). Se leen aca,
 * se mandan una sola vez al backend, y se marcan como enviados para no
 * repetirlo.
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
