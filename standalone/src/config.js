'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { SERVER_URL, JWT_TOKEN } = require('./secrets');

const RECORDS_PATH = '/api/device-records';
const EQUIPO_REGISTRO_PATH = '/api/equipos/registro';
const COLLECT_INTERVAL_MS = 15 * 60 * 1000;

/**
 * DB_ENCRYPTION_KEY no se hardcodea (cifra la cola local de cada instalacion):
 * se genera una vez por PC y se guarda en la carpeta de datos del usuario.
 */
function getOrCreateEncryptionKey(dataDir) {
  const keyPath = path.join(dataDir, 'db-encryption-key.txt');
  try {
    return Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
  } catch {
    const key = crypto.randomBytes(32);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyPath, key.toString('hex'), 'utf8');
    return key;
  }
}

function loadConfig() {
  const dataDir = app.getPath('userData');

  return {
    serverUrl: SERVER_URL,
    jwtToken: JWT_TOKEN,
    recordsPath: RECORDS_PATH,
    equipoRegistroPath: EQUIPO_REGISTRO_PATH,
    collectIntervalMs: COLLECT_INTERVAL_MS,
    dataDir,
    dbEncryptionKey: getOrCreateEncryptionKey(dataDir),
  };
}

module.exports = { loadConfig };
