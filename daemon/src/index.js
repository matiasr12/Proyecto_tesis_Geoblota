'use strict';

const { loadConfig } = require('./config');
const { PendingRecordsStore } = require('./storage/db');
const { StatusFile } = require('./storage/statusFile');
const { createScheduler } = require('./scheduler');
const { version } = require('../package.json');

function main() {
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
