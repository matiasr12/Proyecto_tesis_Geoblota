'use strict';

// Con la base serverless "despertando" el backend puede tardar mas de 10 s en
// responder; si la app corta antes, cree que fallo y reenvia lo que el
// servidor ya guardo.
const REQUEST_TIMEOUT_MS = 30000;
const SALUD_TIMEOUT_MS = 10000;

/**
 * Envia el lote de registros al backend via HTTPS, autenticado con JWT.
 * Lanza si la conexion falla o si el servidor responde con un status distinto de 2xx;
 * el llamador (scheduler) decide que hacer con la cola local en ese caso.
 */
async function sendRecords(records, config) {
  const url = `${config.serverUrl}${config.recordsPath}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.jwtToken}`,
    },
    body: JSON.stringify({ records }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  }

  return true;
}

/**
 * Pregunta al backend si esta vivo (GET /api/salud, no toca la base). Lanza
 * si no responde 2xx: por ejemplo con el App Service detenido.
 */
async function checkServer(config) {
  const response = await fetch(`${config.serverUrl}/api/salud`, {
    headers: { Authorization: `Bearer ${config.jwtToken}` },
    signal: AbortSignal.timeout(SALUD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  }
}

/**
 * Manda el registro de Faena/Area/Persona/Equipo. Se llama una sola vez
 * (el scheduler no reintenta si ya se marco como enviado).
 */
async function registerEquipo(equipoInfo, config) {
  const url = `${config.serverUrl}${config.equipoRegistroPath}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.jwtToken}`,
    },
    body: JSON.stringify(equipoInfo),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  }

  return true;
}

/**
 * Lista de { faena, area } existentes en el backend, para precargar el
 * formulario de registro. Se pide cada vez que se abre el formulario.
 */
async function fetchAreas(config) {
  const url = `${config.serverUrl}${config.areasPath}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.jwtToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  }

  const { areas } = await response.json();
  return areas;
}

/**
 * Lista de { nombre, horaInicio, horaFin } de los turnos existentes en el
 * backend, para el desplegable de turno del formulario de registro.
 */
async function fetchTurnos(config) {
  const url = `${config.serverUrl}${config.turnosPath}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.jwtToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  }

  const { turnos } = await response.json();
  return turnos;
}

module.exports = { sendRecords, registerEquipo, fetchAreas, fetchTurnos, checkServer };
