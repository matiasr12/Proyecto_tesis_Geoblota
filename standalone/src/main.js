'use strict';

const { app, Tray, Menu, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');
const { loadConfig } = require('./config');
const { PendingRecordsStore } = require('./storage/db');
const { createScheduler } = require('./scheduler');
const { registerEquipo } = require('./api/client');
const { markEquipoInfoSent } = require('./equipoRegistration');

const NOTICE_TEXT =
  'Este equipo esta siendo monitoreado para control de inventario de la empresa.';

const STATE_LABELS = {
  online: 'Conectado',
  offline: 'Sin conexion (datos en espera local)',
  error: 'Error al recolectar datos',
};

const ICON_ONLINE_PATH = path.join(__dirname, '..', 'assets', 'tray-icon.png');
const ICON_OFFLINE_PATH = path.join(__dirname, '..', 'assets', 'tray-icon-offline.png');

let tray = null;
let registerWindow = null;
let config = null;
let daemonStatus = { state: null, lastSuccessAt: null, pendingCount: 0, lastError: null };

function equipoInfoPath() {
  return path.join(config.dataDir, 'equipo-info.json');
}

function readEquipoInfo() {
  try {
    return JSON.parse(fs.readFileSync(equipoInfoPath(), 'utf8'));
  } catch {
    return null;
  }
}

function formatTimestamp(iso) {
  if (!iso) return 'Aun sin envios exitosos';
  return new Date(iso).toLocaleString();
}

function buildMenuTemplate() {
  const connectionLabel = daemonStatus.state
    ? STATE_LABELS[daemonStatus.state] || `Estado desconocido (${daemonStatus.state})`
    : 'Iniciando...';

  const items = [
    { label: `Estado: ${connectionLabel}`, enabled: false },
    { label: `Ultimo envio exitoso: ${formatTimestamp(daemonStatus.lastSuccessAt)}`, enabled: false },
  ];

  if (daemonStatus.pendingCount > 0) {
    items.push({ label: `Registros pendientes de envio: ${daemonStatus.pendingCount}`, enabled: false });
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

function refreshMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
  tray.setImage(daemonStatus.state === 'offline' ? ICON_OFFLINE_PATH : ICON_ONLINE_PATH);
}

/**
 * Ventana para completar Faena/Area/Rut/Nombre/Apellido/Codigo de activo.
 * Se abre sola la primera vez (no hay equipo-info.json todavia) y queda
 * disponible en el menu para corregir los datos despues.
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

ipcMain.handle('guardar-equipo-info', async (event, datos) => {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(equipoInfoPath(), JSON.stringify({ ...datos, sent: false }, null, 2), 'utf8');

  // Intenta mandarlo ya mismo en vez de esperar al proximo ciclo de 15 min.
  // Si falla (sin internet, backend caido), no pasa nada: el scheduler
  // reintenta solo en el siguiente tick porque el archivo sigue sin marcarse
  // como enviado.
  try {
    await registerEquipo(datos, config);
    markEquipoInfoSent(config.dataDir, datos);
  } catch {
    // reintenta el scheduler
  }

  return true;
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  app.setLoginItemSettings({ openAtLogin: true });

  config = loadConfig();
  const store = new PendingRecordsStore({ dataDir: config.dataDir, encryptionKey: config.dbEncryptionKey });

  tray = new Tray(ICON_ONLINE_PATH);
  tray.setToolTip('Seguimiento de ubicacion - control de inventario');
  refreshMenu();

  const scheduler = createScheduler({
    config,
    store,
    onStatus: (status) => {
      daemonStatus = { ...daemonStatus, ...status };
      refreshMenu();
    },
  });
  scheduler.start();

  if (!readEquipoInfo()) {
    openRegisterWindow();
  }
});

app.on('window-all-closed', (event) => {
  // La app vive en el tray: la ventana de registro se abre y cierra
  // puntualmente, pero cerrarla no debe cerrar la app (comportamiento por
  // defecto de Electron que hay que anular).
  event.preventDefault();
});
