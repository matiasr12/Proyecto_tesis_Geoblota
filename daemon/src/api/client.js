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

module.exports = { sendRecords };
