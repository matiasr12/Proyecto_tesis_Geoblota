'use strict';

// Con la base serverless "despertando" el backend puede tardar mas de 10 s en
// responder; si la app corta antes, cree que fallo y reenvia lo que el
// servidor ya guardo.
const REQUEST_TIMEOUT_MS = 30000;
const SALUD_TIMEOUT_MS = 10000;

/** Error de "equipo todavia sin token": no es un problema de conexion. */
function sinEnrolar() {
  const error = new Error('Equipo sin registrar: falta el codigo de enrolamiento de TI');
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
 * Pide al backend el token propio del equipo con el codigo que TI entrega al
 * instalar. Devuelve el token; si el codigo no es valido lanza un error con
 * un mensaje para mostrar en el formulario.
 */
async function enrolarEquipo({ computerName, codigo }, config) {
  const response = await fetch(`${config.serverUrl}${config.enrolarPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ computerName, codigo }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401) throw new Error('El codigo de enrolamiento no es valido.');
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

/**
 * Las listas del formulario se piden con el token del equipo o, si todavia
 * no se enrolo, con el codigo de TI que la persona escribio en el formulario.
 */
async function pedirLista(url, config, codigo) {
  let headers;
  if (config.deviceToken) headers = { Authorization: `Bearer ${config.deviceToken}` };
  else if (codigo) headers = { 'X-Codigo-Enrolamiento': codigo };
  else throw sinEnrolar();

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`El servidor respondio ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Lista de { faena, area } existentes en el backend, para precargar el
 * formulario de registro. Se pide cada vez que se abre el formulario.
 */
async function fetchAreas(config, codigo) {
  const { areas } = await pedirLista(`${config.serverUrl}${config.areasPath}`, config, codigo);
  return areas;
}

/**
 * Lista de { nombre, horaInicio, horaFin } de los turnos existentes en el
 * backend, para el desplegable de turno del formulario de registro.
 */
async function fetchTurnos(config, codigo) {
  const { turnos } = await pedirLista(`${config.serverUrl}${config.turnosPath}`, config, codigo);
  return turnos;
}

module.exports = { sendRecords, registerEquipo, enrolarEquipo, fetchAreas, fetchTurnos, checkServer };
