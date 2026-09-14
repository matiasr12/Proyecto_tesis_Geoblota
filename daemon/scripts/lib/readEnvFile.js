'use strict';

const fs = require('fs');

/**
 * Parser minimo de archivos .env (KEY=VALUE por linea, # para comentarios).
 * Se usa solo en scripts de instalacion, para leer credenciales y pasarlas al
 * servicio/daemon sin depender de una libreria externa para algo tan simple.
 */
function readEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

module.exports = { readEnvFile };
