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

/**
 * Igual que el scheduler del daemon, pero en vez de escribir status.json a
 * disco llama a onStatus(status) directo: todo corre en el mismo proceso
 * (tray + recoleccion), no hace falta el archivo como puente entre dos apps.
 */
function createScheduler({ config, store, onStatus, logger = console }) {
  let timer = null;

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
      onStatus({
        state: 'online',
        lastSuccessAt: new Date().toISOString(),
        pendingCount: 0,
      });
    } catch (error) {
      store.enqueue(snapshot);
      onStatus({
        state: 'offline',
        pendingCount: store.count(),
        lastError: error.message,
      });
    }
  }

  function start() {
    tick();
    timer = setInterval(tick, config.collectIntervalMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
  }

  return { start, stop, tick };
}

module.exports = { createScheduler };
