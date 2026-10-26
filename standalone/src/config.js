'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');
const { SERVER_URL, GOOGLE_GEOLOCATION_API_KEY } = require('./secrets');

const RECORDS_PATH = '/api/device-records';
const EQUIPO_REGISTRO_PATH = '/api/equipos/registro';
const AREAS_PATH = '/api/areas';
const TURNOS_PATH = '/api/turnos';
const ENROLAR_PATH = '/api/equipos/enrolar';
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

/**
 * Token propio del equipo, que entrega el backend la primera vez que se
 * conecta (la app se enrola sola). El instalador no trae ningun secreto: se guarda aca,
 * cifrado con la proteccion de Windows (DPAPI, via safeStorage) cuando esta
 * disponible.
 */
function tokenPath(dataDir) {
  return path.join(dataDir, 'device-token.bin');
}

function leerTokenEquipo(dataDir) {
  try {
    const contenido = fs.readFileSync(tokenPath(dataDir));
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(contenido) : contenido.toString('utf8');
  } catch {
    return null;
  }
}

function guardarTokenEquipo(dataDir, token) {
  fs.mkdirSync(dataDir, { recursive: true });
  const contenido = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token, 'utf8');
  fs.writeFileSync(tokenPath(dataDir), contenido);
}

function loadConfig() {
  const dataDir = app.getPath('userData');

  return {
    serverUrl: SERVER_URL,
    // null hasta que el equipo se enrola (sola, al primer envio).
    deviceToken: leerTokenEquipo(dataDir),
    enrolarPath: ENROLAR_PATH,
    recordsPath: RECORDS_PATH,
    equipoRegistroPath: EQUIPO_REGISTRO_PATH,
    areasPath: AREAS_PATH,
    turnosPath: TURNOS_PATH,
    collectIntervalMs: COLLECT_INTERVAL_MS,
    dataDir,
    dbEncryptionKey: getOrCreateEncryptionKey(dataDir),
    googleGeolocationApiKey: GOOGLE_GEOLOCATION_API_KEY || null,
  };
}

module.exports = { loadConfig, guardarTokenEquipo };
