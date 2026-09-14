'use strict';

const fs = require('fs');
const path = require('path');
const { readEnvFile } = require('../scripts/lib/readEnvFile');
const { loadConfig } = require('./config');
const { PendingRecordsStore } = require('./storage/db');
const { StatusFile } = require('./storage/statusFile');
const { createScheduler } = require('./scheduler');
const { version } = require('../package.json');

/**
 * En modo desarrollo (npm start) se lee el .env de la raiz del proyecto si existe.
 * En produccion (servicio de Windows / launchd) las variables ya vienen inyectadas
 * por el instalador y no hay .env, asi que esto no pisa nada.
 */
function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const fileEnv = readEnvFile(envPath);
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function main() {
  loadDotEnv();
  const config = loadConfig();
  const store = new PendingRecordsStore({ dataDir: config.dataDir, encryptionKey: config.dbEncryptionKey });
  const statusFile = new StatusFile({ dataDir: config.dataDir, version });
  const scheduler = createScheduler({ config, store, statusFile });

  scheduler.start();
  console.log(`Daemon iniciado. Intervalo: ${config.collectIntervalMs}ms. Datos en: ${config.dataDir}`);

  const shutdown = () => {
    scheduler.stop();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
