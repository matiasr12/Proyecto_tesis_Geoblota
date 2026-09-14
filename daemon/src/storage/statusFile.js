'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Escribe un resumen NO sensible del estado del daemon (sin nombre de equipo, WiFi ni
 * IP) para que el tray de Electron lo lea y lo muestre en su menu. Escritura atomica
 * via archivo temporal + rename para que el tray nunca lea un JSON a medio escribir.
 */
class StatusFile {
  constructor({ dataDir, version }) {
    this.filePath = path.join(dataDir, 'status.json');
    this.tmpPath = `${this.filePath}.tmp`;
    this.version = version;
    this.lastSuccessAt = null;
    fs.mkdirSync(dataDir, { recursive: true });
    try {
      const previous = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.lastSuccessAt = previous.lastSuccessAt || null;
    } catch {
      // No hay status.json previo (primer arranque) o esta corrupto: se parte en null.
    }
  }

  write({ state, lastSuccessAt, pendingCount, lastError }) {
    if (lastSuccessAt) {
      this.lastSuccessAt = lastSuccessAt;
    }
    const payload = {
      state,
      lastSuccessAt: this.lastSuccessAt,
      pendingCount,
      lastError: lastError || null,
      version: this.version,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(this.tmpPath, this.filePath);
  }
}

module.exports = { StatusFile };
