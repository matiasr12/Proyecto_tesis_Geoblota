'use strict';

const { collectSnapshot } = require('./collectors');
const { sendRecords } = require('./api/client');

/**
 * Cada tick: recolecta un snapshot nuevo, intenta enviarlo junto con todo lo que
 * hubiera quedado pendiente en la cola local, y segun el resultado limpia la cola o
 * agrega el snapshot nuevo a ella. Nunca se pierde un registro: si el envio falla,
 * el snapshot recien tomado tambien queda encolado antes de terminar el tick.
 */
function createScheduler({ config, store, statusFile, logger = console }) {
  let timer = null;

  async function tick() {
    let snapshot;
    try {
      snapshot = await collectSnapshot();
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
