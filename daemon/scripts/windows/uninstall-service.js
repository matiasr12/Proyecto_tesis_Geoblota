'use strict';

const path = require('path');
const { execSync } = require('child_process');

const SERVICE_NAME = 'TesisDaemon';

function assertElevated() {
  try {
    execSync('net session', { stdio: 'ignore' });
  } catch {
    console.error(
      'Este script necesita permisos de administrador. Abri una consola como administrador ' +
        'y volve a correr "npm run service:uninstall".'
    );
    process.exit(1);
  }
}

function main() {
  if (process.platform !== 'win32') {
    console.error('Este script es solo para Windows.');
    process.exit(1);
  }

  assertElevated();

  const { Service } = require('node-windows');

  const svc = new Service({
    name: SERVICE_NAME,
    script: path.join(__dirname, '..', '..', 'src', 'index.js'),
  });

  svc.on('uninstall', () => {
    console.log(`Servicio "${SERVICE_NAME}" desinstalado.`);
  });

  svc.on('error', (err) => {
    console.error('Error desinstalando el servicio:', err);
    process.exit(1);
  });

  svc.uninstall();
}

main();
