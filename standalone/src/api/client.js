'use strict';

// Con la base serverless "despertando" el backend puede tardar mas de 10 s en
// responder; si la app corta antes, cree que fallo y reenvia lo que el
// servidor ya guardo.
const REQUEST_TIMEOUT_MS = 30000;
const SALUD_TIMEOUT_MS = 10000;

/** Error de "equipo todavia sin token": no es un problema de conexion. */
function sinEnrolar() {
  const error = new Error('Equipo sin registrar todavia en el servidor');
  error.code = 'SIN_ENROLAR';
  return error;
}

function tokenEquipo(config) {
  if (!config.deviceToken) throw sinEnrolar();
  return { Authorization: `Bearer ${config.deviceToken}` };
}

async function enviarJson(url, cuerpo, headers) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  }
  return response;
}

/**
 * Envia el lote de registros al backend via HTTPS, con el token propio del
 * equipo. Lanza si no hay token, si la conexion falla o si el servidor
 * responde con un status distinto de 2xx; el scheduler decide que hacer con
 * la cola local en ese caso.
 */
async function sendRecords(records, config) {
  await enviarJson(`${config.serverUrl}${config.recordsPath}`, { records }, tokenEquipo(config));
  return true;
}

/**
 * Pregunta al backend si esta vivo (GET /api/salud, publica y sin datos; no
 * toca la base). Lanza si no responde 2xx: por ejemplo con el App Service
 * detenido.
 */
async function checkServer(config) {
  const response = await fetch(`${config.serverUrl}/api/salud`, {
    signal: AbortSignal.timeout(SALUD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  }
}

/**
 * Pide al backend el token propio del equipo (solo con su ComputerName).
 */
async function enrolarEquipo({ computerName }, config) {
  const response = await fetch(`${config.serverUrl}${config.enrolarPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ computerName }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  const { token } = await response.json();
  return token;
}

/**
 * Manda el registro de Faena/Area/Persona/Equipo. Se llama una sola vez
 * (el scheduler no reintenta si ya se marco como enviado).
 */
async function registerEquipo(equipoInfo, config) {
  await enviarJson(`${config.serverUrl}${config.equipoRegistroPath}`, equipoInfo, tokenEquipo(config));
  return true;
}

/** Las listas del formulario se piden con el token del equipo. */
async function pedirLista(url, config) {
  const response = await fetch(url, { headers: tokenEquipo(config), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Lista de { faena, area } existentes en el backend, para precargar el
 * formulario de registro. Se pide cada vez que se abre el formulario.
 */
async function fetchAreas(config) {
  const { areas } = await pedirLista(`${config.serverUrl}${config.areasPath}`, config);
  return areas;
}

/**
 * Lista de { nombre, horaInicio, horaFin } de los turnos existentes en el
 * backend, para el desplegable de turno del formulario de registro.
 */
async function fetchTurnos(config) {
  const { turnos } = await pedirLista(`${config.serverUrl}${config.turnosPath}`, config);
  return turnos;
}

module.exports = { sendRecords, registerEquipo, enrolarEquipo, fetchAreas, fetchTurnos, checkServer };
