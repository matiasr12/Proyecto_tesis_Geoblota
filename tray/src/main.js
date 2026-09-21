'use strict';

const { app, Tray, Menu, BrowserWindow, ipcMain } = require('electron');
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
const equipoInfoPath = path.join(dataDir, 'equipo-info.json');

function readDaemonStatus() {
  try {
    const raw = fs.readFileSync(statusFilePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readEquipoInfo() {
  try {
    return JSON.parse(fs.readFileSync(equipoInfoPath, 'utf8'));
  } catch {
    return null;
  }
}

function formatTimestamp(iso) {
  if (!iso) return 'Aun sin envios exitosos';
  return new Date(iso).toLocaleString();
}

function buildMenuTemplate(status) {
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
    { label: 'Registrar/editar equipo...', click: openRegisterWindow },
    { type: 'separator' },
    { label: NOTICE_TEXT, enabled: false }
  );

  return items;
}

const ICON_ONLINE_PATH = path.join(__dirname, '..', 'assets', 'tray-icon.png');
const ICON_OFFLINE_PATH = path.join(__dirname, '..', 'assets', 'tray-icon-offline.png');

let tray = null;
let registerWindow = null;

/**
 * Ventana para completar Faena/Area/Rut/Nombre/Apellido/Codigo de activo.
 * Se abre sola la primera vez (no hay equipo-info.json todavia) y queda
 * disponible en el menu para corregir los datos despues. Se destruye al
 * cerrarse, no queda ocupando memoria de fondo.
 */
function openRegisterWindow() {
  if (registerWindow) {
    registerWindow.focus();
    return;
  }

  registerWindow = new BrowserWindow({
    width: 380,
    height: 480,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'registerPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  registerWindow.loadFile(path.join(__dirname, 'register.html'));
  registerWindow.on('closed', () => {
    registerWindow = null;
  });
}

ipcMain.handle('cargar-equipo-info', () => readEquipoInfo());

ipcMain.handle('guardar-equipo-info', (event, datos) => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(equipoInfoPath, JSON.stringify({ ...datos, sent: false }, null, 2), 'utf8');
  return true;
});

function refreshMenu() {
  if (!tray) return;
  const status = readDaemonStatus();
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate(status)));
  tray.setImage(status && status.state === 'offline' ? ICON_OFFLINE_PATH : ICON_ONLINE_PATH);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  tray = new Tray(ICON_ONLINE_PATH);
  tray.setToolTip('Seguimiento de ubicacion - control de inventario');

  refreshMenu();
  setInterval(refreshMenu, STATUS_POLL_MS);

  if (!readEquipoInfo()) {
    openRegisterWindow();
  }
});

app.on('window-all-closed', (event) => {
  // La app vive en el tray, no en ventanas: la ventana de registro se abre y
  // cierra puntualmente, pero cerrarla no debe cerrar la app (comportamiento
  // por defecto de Electron que hay que anular).
  event.preventDefault();
});
