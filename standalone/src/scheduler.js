'use strict';

const { collectSnapshot, getComputerName } = require('./collectors');
const { sendRecords, registerEquipo, checkServer } = require('./api/client');
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

// Cada cuanto se pregunta al sistema si hay red, para poner el icono en rojo
// apenas se corta (sin esperar a que falle un envio) y reenviar apenas vuelve.
const VIGILANCIA_RED_MS = 10 * 1000;

// Con red, cada cuanto se pregunta al backend si esta vivo (por ejemplo, si
// se detuvo el App Service), para no seguir en azul hasta el proximo tick.
const VERIFICACION_SERVIDOR_MS = 60 * 1000;

/**
 * Igual que el scheduler del daemon, pero en vez de escribir status.json a
 * disco llama a onStatus(status) directo: todo corre en el mismo proceso
 * (tray + recoleccion), no hace falta el archivo como puente entre dos apps.
 */
function createScheduler({ config, store, onStatus, hayRed = () => true, logger = console }) {
  let timer = null;
  let reintentoTimer = null;
  let vigilanciaTimer = null;
  let servidorTimer = null;
  let estado = null;
  let redAnterior = true;
  const avisar = (status) => {
    estado = status.state;
    onStatus(status);
  };
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
   * lectura nueva (la de ahora, no solo las encoladas). Con la cola vacia
   * (se corto la red entre ticks) basta con el tick.
   */
  async function reintentar() {
    // Ya reconecto otro reintento que estaba en la fila, o sigue sin red.
    if (estado !== 'offline' || !hayRed()) return;
    const pending = store.getAll();
    if (pending.length === 0) {
      // Sin cola que probar: antes de juntar una lectura nueva se confirma que
      // el backend responde, si no cada reintento agregaria una a la cola.
      try {
        await checkServer(config);
      } catch {
        return;
      }
      detenerReintentos();
      await tick();
      return;
    }
    try {
      await sendRecords(pending.map((p) => p.record), config);
    } catch {
      return; // sigue sin conexion; se reintenta en REINTENTO_SIN_CONEXION_MS
    }
    store.deleteByIds(pending.map((p) => p.id));
    detenerReintentos();
    avisar({ state: 'online', lastSuccessAt: new Date().toISOString(), pendingCount: 0 });
    await tick();
  }

  /**
   * Sin red: icono en rojo de inmediato. Al volver la red: reenvia de
   * inmediato, sin esperar el proximo reintento.
   */
  function vigilarRed() {
    const red = hayRed();
    if (!red && estado !== 'offline') {
      avisar({ state: 'offline', pendingCount: store.count(), lastError: 'Sin conexion de red' });
      iniciarReintentos();
    }
    if (red && !redAnterior) enOrden(reintentar);
    redAnterior = red;
  }

  /** Con red y en azul: si el backend no responde, pasa a rojo. */
  async function verificarServidor() {
    if (estado !== 'online') return;
    try {
      await checkServer(config);
    } catch (error) {
      avisar({ state: 'offline', pendingCount: store.count(), lastError: error.message });
      iniciarReintentos();
    }
  }

  async function tick() {
    await trySendPendingEquipoInfo(config, config.dataDir, logger);

    let snapshot;
    try {
      snapshot = await collectSnapshot(config);
    } catch (error) {
      logger.error('Fallo al recolectar el snapshot:', error);
      avisar({ state: 'error', pendingCount: store.count(), lastError: error.message });
      return;
    }

    const pending = store.getAll();
    const batch = [...pending.map((p) => p.record), snapshot];

    try {
      await sendRecords(batch, config);
      store.deleteByIds(pending.map((p) => p.id));
      detenerReintentos();
      avisar({
        state: 'online',
        lastSuccessAt: new Date().toISOString(),
        pendingCount: 0,
      });
    } catch (error) {
      store.enqueue(snapshot);
      iniciarReintentos();
      avisar({
        state: 'offline',
        pendingCount: store.count(),
        lastError: error.message,
      });
    }
  }

  function start() {
    enOrden(tick);
    timer = setInterval(() => enOrden(tick), config.collectIntervalMs);
    vigilanciaTimer = setInterval(vigilarRed, VIGILANCIA_RED_MS);
    servidorTimer = setInterval(() => enOrden(verificarServidor), VERIFICACION_SERVIDOR_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
    if (vigilanciaTimer) clearInterval(vigilanciaTimer);
    if (servidorTimer) clearInterval(servidorTimer);
    detenerReintentos();
  }

  return { start, stop, tick };
}

module.exports = { createScheduler };
