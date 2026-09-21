'use strict';

const os = require('os');
const path = require('path');

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

function getDefaultDataDir() {
  if (process.platform === 'win32') {
    const base = process.env.PROGRAMDATA || 'C:\\ProgramData';
    return path.join(base, 'TesisDaemon');
  }
  if (process.platform === 'darwin') {
    return '/Library/Application Support/TesisDaemon';
  }
  return path.join(os.homedir(), '.tesis-daemon');
}

/**
 * Configuracion del daemon, leida desde variables de entorno.
 * Nada de URLs, claves o secretos va escrito en el codigo fuente.
 *
 * Variables esperadas:
 *  - SERVER_URL (obligatoria): base URL HTTPS del backend, ej. https://api.empresa.cl
 *  - JWT_TOKEN (obligatoria): token JWT usado para autenticar cada envio
 *  - DB_ENCRYPTION_KEY (obligatoria): clave hex de 64 caracteres (32 bytes) para AES-256-GCM
 *  - SERVER_RECORDS_PATH (opcional): path del endpoint de envio, default /api/device-records
 *  - EQUIPO_REGISTRO_PATH (opcional): path del endpoint de registro de equipo, default /api/equipos/registro
 *  - COLLECT_INTERVAL_MS (opcional): intervalo del loop, default 15 minutos
 *  - DAEMON_DATA_DIR (opcional): carpeta para el SQLite local y el archivo de estado
 */
function loadConfig() {
  const serverUrl = required('SERVER_URL').replace(/\/+$/, '');
  const jwtToken = required('JWT_TOKEN');
  const dbEncryptionKeyHex = required('DB_ENCRYPTION_KEY');

  if (!/^[0-9a-fA-F]{64}$/.test(dbEncryptionKeyHex)) {
    throw new Error('DB_ENCRYPTION_KEY debe ser un string hex de 64 caracteres (32 bytes / AES-256)');
  }

  return {
    serverUrl,
    jwtToken,
    dbEncryptionKey: Buffer.from(dbEncryptionKeyHex, 'hex'),
    recordsPath: process.env.SERVER_RECORDS_PATH || '/api/device-records',
    equipoRegistroPath: process.env.EQUIPO_REGISTRO_PATH || '/api/equipos/registro',
    collectIntervalMs: Number(process.env.COLLECT_INTERVAL_MS) || 15 * 60 * 1000,
    dataDir: process.env.DAEMON_DATA_DIR || getDefaultDataDir(),
  };
}

module.exports = { loadConfig };
