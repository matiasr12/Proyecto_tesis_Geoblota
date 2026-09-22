'use strict';

const { collectSnapshot, getComputerName } = require('./collectors');
const { sendRecords, registerEquipo } = require('./api/client');
const { readPendingEquipoInfo, markEquipoInfoSent } = require('./equipoRegistration');

/**
 * Si el tray dejo datos de Faena/Area/Persona sin enviar (equipo-info.json),
 * los manda una sola vez. La ventana de registro no pregunta el nombre del
 * equipo (no tiene sentido que lo tipee una persona), asi que se agrega aca
 * antes de mandarlo. Si falla, no hace nada mas: el proximo tick reintenta
 * solo porque el archivo sigue sin marcarse como enviado. No afecta el estado
 * online/offline del envio de registros, son cosas independientes.
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
 * Cada tick: recolecta un snapshot nuevo, intenta enviarlo junto con todo lo que
 * hubiera quedado pendiente en la cola local, y segun el resultado limpia la cola o
 * agrega el snapshot nuevo a ella. Nunca se pierde un registro: si el envio falla,
 * el snapshot recien tomado tambien queda encolado antes de terminar el tick.
 */
function createScheduler({ config, store, statusFile, logger = console }) {
  let timer = null;

  async function tick() {
    await trySendPendingEquipoInfo(config, config.dataDir, logger);

    let snapshot;
    try {
      snapshot = await collectSnapshot(config);
    } catch (error) {
      logger.error('Fallo al recolectar el snapshot:', error);
      statusFile.write({ state: 'error', pendingCount: store.count(), lastError: error.message });
      return;
    }

    const pending = store.getAll();
    const batch = [...pending.map((p) => p.record), snapshot];

    try {
      await sendRecords(batch, config);
      store.deleteByIds(pending.map((p) => p.id));
      statusFile.write({
        state: 'online',
        lastSuccessAt: new Date().toISOString(),
        pendingCount: 0,
      });
    } catch (error) {
      store.enqueue(snapshot);
      statusFile.write({
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
