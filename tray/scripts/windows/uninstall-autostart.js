'use strict';

const fs = require('fs');
const path = require('path');

const SHORTCUT_NAME = 'TesisTray.lnk';

function main() {
  if (process.platform !== 'win32') {
    console.error('Este script es solo para Windows.');
    process.exit(1);
  }

  const shortcutPath = path.join(
    process.env.APPDATA,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    SHORTCUT_NAME
  );

  if (fs.existsSync(shortcutPath)) {
    fs.unlinkSync(shortcutPath);
    console.log(`Acceso directo eliminado: ${shortcutPath}`);
  } else {
    console.log('No habia un acceso directo de autoarranque instalado.');
  }
}

main();
