'use strict';

const { app, Tray, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { version } = require('../package.json');

const STATUS_POLL_MS = 15000;

const NOTICE_TEXT =
  'Este equipo esta siendo monitoreado para control de inventario de la empresa.';

const STATE_LABELS = {
  online: 'Conectado',
  offline: 'Sin conexion (datos en espera local)',
  error: 'Error al recolectar datos',
};

// Debe coincidir con el default de daemon/src/config.js (mismo DAEMON_DATA_DIR).
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

const dataDir = process.env.DAEMON_DATA_DIR || getDefaultDataDir();
const statusFilePath = path.join(dataDir, 'status.json');

function readDaemonStatus() {
  try {
    const raw = fs.readFileSync(statusFilePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatTimestamp(iso) {
  if (!iso) return 'Aun sin envios exitosos';
  return new Date(iso).toLocaleString();
}

function buildMenuTemplate() {
  const status = readDaemonStatus();

  const connectionLabel = status
    ? STATE_LABELS[status.state] || `Estado desconocido (${status.state})`
    : 'Esperando primer registro del servicio...';

  const lastSuccessLabel = `Ultimo envio exitoso: ${formatTimestamp(status && status.lastSuccessAt)}`;
  const pendingLabel =
    status && status.pendingCount > 0 ? `Registros pendientes de envio: ${status.pendingCount}` : null;

  const items = [
    { label: `Estado: ${connectionLabel}`, enabled: false },
    { label: lastSuccessLabel, enabled: false },
  ];

  if (pendingLabel) {
    items.push({ label: pendingLabel, enabled: false });
  }

  items.push(
    { label: `Version: ${version}`, enabled: false },
    { type: 'separator' },
    { label: NOTICE_TEXT, enabled: false }
  );

  return items;
}

let tray = null;

function refreshMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Seguimiento de ubicacion - control de inventario');

  refreshMenu();
  setInterval(refreshMenu, STATUS_POLL_MS);
});

app.on('window-all-closed', (event) => {
  // Nunca hay ventanas: no cerrar la app cuando este evento se dispare igual por
  // comportamiento por defecto de Electron.
  event.preventDefault();
});
