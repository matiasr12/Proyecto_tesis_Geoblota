'use strict';

const { app, Tray, Menu, BrowserWindow, ipcMain, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');
const { loadConfig, guardarTokenEquipo } = require('./config');
const { PendingRecordsStore } = require('./storage/db');
const { createScheduler } = require('./scheduler');
const { registerEquipo, enrolarEquipo, fetchAreas, fetchTurnos } = require('./api/client');
const { markEquipoInfoSent } = require('./equipoRegistration');
const { getComputerName } = require('./collectors');

const NOTICE_TEXT =
  'Este equipo esta siendo monitoreado para control de inventario de la empresa.';

const STATE_LABELS = {
  online: 'Conectado',
  offline: 'Sin conexion (datos en espera local)',
  error: 'Error al recolectar datos',
  sin_enrolar: 'Sin registrar: falta el codigo de enrolamiento de TI',
};

const ICON_ONLINE_PATH = path.join(__dirname, '..', 'assets', 'tray-icon.png');
const ICON_OFFLINE_PATH = path.join(__dirname, '..', 'assets', 'tray-icon-offline.png');

let tray = null;
let registerWindow = null;
let config = null;
let scheduler = null;
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
  const enRojo = daemonStatus.state === 'offline' || daemonStatus.state === 'sin_enrolar';
  tray.setImage(enRojo ? ICON_OFFLINE_PATH : ICON_ONLINE_PATH);
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
    width: 470,
    height: 810,
    resizable: false,
    autoHideMenuBar: true,
    // Se muestra recien cuando ya esta pintada, en vez de un recuadro en
    // blanco mientras carga.
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'registerPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  registerWindow.once('ready-to-show', () => registerWindow.show());
  registerWindow.loadFile(path.join(__dirname, 'register.html'));
  registerWindow.on('closed', () => {
    registerWindow = null;
  });
}

ipcMain.handle('cargar-equipo-info', () => readEquipoInfo());

// Si el equipo ya tiene su token, el formulario no vuelve a pedir el codigo.
ipcMain.handle('esta-enrolado', () => Boolean(config.deviceToken));

// Sin conexion (o sin codigo todavia) devuelve [] y el formulario muestra el
// aviso. codigo es el de enrolamiento que escribio la persona, si aun no hay token.
ipcMain.handle('listar-areas', async (event, codigo) => {
  try {
    return await fetchAreas(config, codigo);
  } catch {
    return [];
  }
});

ipcMain.handle('listar-turnos', async (event, codigo) => {
  try {
    return await fetchTurnos(config, codigo);
  } catch {
    return [];
  }
});

ipcMain.handle('guardar-equipo-info', async (event, { codigo, ...datos }) => {
  // Primera vez: con el codigo de TI se obtiene el token propio del equipo.
  // Requiere conexion; si falla, el error se muestra en el formulario y no se
  // guarda nada. El codigo no se guarda en disco.
  if (!config.deviceToken) {
    if (!codigo) throw new Error('Falta el codigo de enrolamiento que entrega TI.');
    const { computerName } = await getComputerName();
    const token = await enrolarEquipo({ computerName, codigo }, config);
    guardarTokenEquipo(config.dataDir, token);
    config.deviceToken = token;
  }

  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(equipoInfoPath(), JSON.stringify({ ...datos, sent: false }, null, 2), 'utf8');

  // Intenta mandarlo ya mismo en vez de esperar al proximo ciclo de 15 min.
  // Si falla (sin internet, backend caido), no pasa nada: el scheduler
  // reintenta solo en el siguiente tick porque el archivo sigue sin marcarse
  // como enviado.
  try {
    const { computerName } = await getComputerName();
    await registerEquipo({ ...datos, computerName }, config);
    markEquipoInfoSent(config.dataDir, datos);
  } catch {
    // reintenta el scheduler
  }
  // Manda de inmediato lo que quedo en cola mientras no habia token.
  if (scheduler) scheduler.enviarAhora();

  return true;
});

// Una sola instancia: si se abre otra (inicio automatico + clic del usuario),
// las dos mandarian la misma cola y duplicarian lecturas. La segunda se
// cierra; la primera, si ya hay que registrar, muestra la ventana.
const esInstanciaPrincipal = app.requestSingleInstanceLock();
if (!esInstanciaPrincipal) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (registerWindow && !registerWindow.isDestroyed()) registerWindow.focus();
  });
}

app.whenReady().then(() => {
  if (!esInstanciaPrincipal) return;
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  app.setLoginItemSettings({ openAtLogin: true });

  config = loadConfig();
  const store = new PendingRecordsStore({ dataDir: config.dataDir, encryptionKey: config.dbEncryptionKey });

  tray = new Tray(ICON_ONLINE_PATH);
  tray.setToolTip('Seguimiento de ubicacion - control de inventario');
  refreshMenu();

  scheduler = createScheduler({
    config,
    store,
    // true si el equipo tiene alguna red activa (no garantiza internet: eso
    // lo detecta el envio que falla).
    hayRed: () => net.isOnline(),
    onStatus: (status) => {
      daemonStatus = { ...daemonStatus, ...status };
      refreshMenu();
    },
  });
  // La primera recoleccion lanza varios PowerShell/netsh a la vez, que
  // compiten con la ventana de registro y la hacen tardar en aparecer. Si hay
  // que mostrarla, la recoleccion arranca recien cuando ya esta en pantalla.
  // Tambien se abre si ya hay datos pero falta el token (instalacion anterior
  // a los tokens por equipo): hay que ingresar el codigo de TI.
  if (!readEquipoInfo() || !config.deviceToken) {
    openRegisterWindow();
    registerWindow.once('ready-to-show', () => scheduler.start());
  } else {
    scheduler.start();
  }
});

app.on('window-all-closed', (event) => {
  // La app vive en el tray: la ventana de registro se abre y cierra
  // puntualmente, pero cerrarla no debe cerrar la app (comportamiento por
  // defecto de Electron que hay que anular).
  event.preventDefault();
});
