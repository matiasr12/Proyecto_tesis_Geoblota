'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { readEnvFile } = require('../lib/readEnvFile');

const ENV_FILE = path.join(__dirname, '..', '..', '.env');
const SERVICE_NAME = 'TesisDaemon';

function assertElevated() {
  try {
    execSync('net session', { stdio: 'ignore' });
  } catch {
    console.error(
      'Este script necesita permisos de administrador. Abri una consola (cmd o PowerShell) ' +
        'como administrador y volve a correr "npm run service:install".'
    );
    process.exit(1);
  }
}

function main() {
  if (process.platform !== 'win32') {
    console.error('Este instalador es solo para Windows. Para macOS usar scripts/macos/.');
    process.exit(1);
  }

  assertElevated();

  if (!fs.existsSync(ENV_FILE)) {
    console.error(
      `No se encontro ${ENV_FILE}. Copia .env.example a .env y completa SERVER_URL, ` +
        'JWT_TOKEN y DB_ENCRYPTION_KEY antes de instalar el servicio.'
    );
    process.exit(1);
  }

  const envFromFile = readEnvFile(ENV_FILE);
  Object.assign(process.env, envFromFile);

  // Reusa la misma validacion que usa el daemon en runtime (config.js), para no
  // instalar un servicio que va a fallar apenas arranque por falta de config.
  const { loadConfig } = require('../../src/config');
  loadConfig();

  const { Service } = require('node-windows');

  const svc = new Service({
    name: SERVICE_NAME,
    description:
      'Registra periodicamente la ubicacion aproximada del equipo (WiFi cercanas) para control de inventario.',
    script: path.join(__dirname, '..', '..', 'src', 'index.js'),
    env: Object.entries(envFromFile).map(([name, value]) => ({ name, value })),
  });

  svc.on('install', () => {
    console.log(`Servicio "${SERVICE_NAME}" instalado. Iniciando...`);
    svc.start();
  });

  svc.on('start', () => {
    console.log(`Servicio "${SERVICE_NAME}" iniciado y configurado para arrancar con Windows.`);
  });

  svc.on('error', (err) => {
    console.error('Error instalando el servicio:', err);
    process.exit(1);
  });

  svc.install();
}

main();
