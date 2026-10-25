'use strict';

const { collectSnapshot, getComputerName } = require('./collectors');
const { sendRecords, registerEquipo } = require('./api/client');
const { readPendingEquipoInfo, markEquipoInfoSent } = require('./equipoRegistration');

/**
 * Si la ventana de registro dejo datos de Faena/Area/Persona sin enviar
 * (equipo-info.json), los manda una sola vez. La ventana no pregunta el
 * nombre del equipo (no tiene sentido que lo tipee una persona), asi que se
 * agrega aca antes de mandarlo. Si falla, no hace nada mas: el proximo tick
 * reintenta solo porque el archivo sigue sin marcarse como enviado. No afecta
 * el estado online/offline del envio de registros.
 */
async function trySendPendingEquipoInfo(config, dataDir, logger) {
  const pending = readPendingEquipoInfo(dataDir);
  if (!pending) return;

  try {
    const { computerName } = await getComputerName();
    await registerEquipo({ ...pending, computerName }, config);
    markEquipoInfoSent(dataDir, pending);
  } catch (error) {
    logger.error('Fallo al registrar el equipo (se reintenta en el proximo tick):', error.message);
  }
}

// Sin conexion, cada cuanto se reintenta mandar la cola (sin juntar snapshots
// nuevos), para que al volver internet se envie de inmediato y no recien en
// el proximo tick de 15 min.
const REINTENTO_SIN_CONEXION_MS = 30 * 1000;

/**
 * Igual que el scheduler del daemon, pero en vez de escribir status.json a
 * disco llama a onStatus(status) directo: todo corre en el mismo proceso
 * (tray + recoleccion), no hace falta el archivo como puente entre dos apps.
 */
function createScheduler({ config, store, onStatus, logger = console }) {
  let timer = null;
  let reintentoTimer = null;
  // tick y reintentar nunca corren a la vez: si se solaparan, los mismos
  // registros de la cola se mandarian dos veces.
  let enCurso = Promise.resolve();
  const enOrden = (fn) => {
    enCurso = enCurso.then(fn, fn);
    return enCurso;
  };

  function detenerReintentos() {
    if (reintentoTimer) clearInterval(reintentoTimer);
    reintentoTimer = null;
  }

  function iniciarReintentos() {
    if (!reintentoTimer) reintentoTimer = setInterval(() => enOrden(reintentar), REINTENTO_SIN_CONEXION_MS);
  }

  /**
   * Mientras se esta sin conexion: intenta mandar solo la cola. Si sale bien
   * volvio internet, asi que corre un tick completo para mandar tambien una
   * lectura nueva (la de ahora, no solo las encoladas).
   */
  async function reintentar() {
    const pending = store.getAll();
    if (pending.length === 0) {
      detenerReintentos();
      return;
    }
    try {
      await sendRecords(pending.map((p) => p.record), config);
    } catch {
      return; // sigue sin conexion; se reintenta en REINTENTO_SIN_CONEXION_MS
    }
    store.deleteByIds(pending.map((p) => p.id));
    detenerReintentos();
    onStatus({ state: 'online', lastSuccessAt: new Date().toISOString(), pendingCount: 0 });
    await tick();
  }

  async function tick() {
    await trySendPendingEquipoInfo(config, config.dataDir, logger);

    let snapshot;
    try {
      snapshot = await collectSnapshot(config);
    } catch (error) {
      logger.error('Fallo al recolectar el snapshot:', error);
      onStatus({ state: 'error', pendingCount: store.count(), lastError: error.message });
      return;
    }

    const pending = store.getAll();
    const batch = [...pending.map((p) => p.record), snapshot];

    try {
      await sendRecords(batch, config);
      store.deleteByIds(pending.map((p) => p.id));
      detenerReintentos();
      onStatus({
        state: 'online',
        lastSuccessAt: new Date().toISOString(),
        pendingCount: 0,
      });
    } catch (error) {
      store.enqueue(snapshot);
      iniciarReintentos();
      onStatus({
        state: 'offline',
        pendingCount: store.count(),
        lastError: error.message,
      });
    }
  }

  function start() {
    enOrden(tick);
    timer = setInterval(() => enOrden(tick), config.collectIntervalMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    detenerReintentos();
  }

  return { start, stop, tick };
}

module.exports = { createScheduler };
