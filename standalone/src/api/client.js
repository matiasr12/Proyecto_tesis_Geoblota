'use strict';

const REQUEST_TIMEOUT_MS = 10000;

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

module.exports = { sendRecords, registerEquipo };
