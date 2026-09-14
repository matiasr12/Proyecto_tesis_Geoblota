'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIST_DIR = path.join(__dirname, '..', '..', 'dist');
const SHORTCUT_NAME = 'TesisTray.lnk';

function findPortableExe() {
  if (!fs.existsSync(DIST_DIR)) return null;
  const exe = fs.readdirSync(DIST_DIR).find((f) => f.endsWith('.exe'));
  return exe ? path.join(DIST_DIR, exe) : null;
}

function main() {
  if (process.platform !== 'win32') {
    console.error('Este script es solo para Windows.');
    process.exit(1);
  }

  const exePath = findPortableExe();
  if (!exePath) {
    console.error('No se encontro el ejecutable en dist/. Corre primero "npm run build:win".');
    process.exit(1);
  }

  const startupDir = path.join(
    process.env.APPDATA,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup'
  );
  const shortcutPath = path.join(startupDir, SHORTCUT_NAME);

  // Se corre por sesion de usuario (no requiere admin): el tray necesita una sesion
  // grafica activa, algo a lo que un Windows Service NO tiene acceso (Session 0
  // isolation), por eso el autoarranque va por el Startup folder del usuario y no
  // junto con el daemon.
  const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, '\\\\')}")
$Shortcut.TargetPath = "${exePath.replace(/\\/g, '\\\\')}"
$Shortcut.WorkingDirectory = "${path.dirname(exePath).replace(/\\/g, '\\\\')}"
$Shortcut.Description = "Seguimiento de ubicacion - control de inventario"
$Shortcut.Save()
`.trim();

  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
  console.log(`Acceso directo creado en: ${shortcutPath}`);
  console.log('El tray se abrira automaticamente la proxima vez que inicies sesion en Windows.');
}

main();
