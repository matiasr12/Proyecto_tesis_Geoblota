'use strict';

const http = require('http');
const { isAuthorized, deviceTokenFor, getDeviceName } = require('./auth');
const { insertRecords, upsertEquipoRegistro, getEquiposConUltimaUbicacion, getAreas, getTurnos } = require('./db');

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB, de sobra para un lote de registros

function isValidRecord(record) {
  return (
    record &&
    typeof record.computerName === 'string' &&
    Array.isArray(record.bssids) &&
    record.bssids.every((b) => typeof b === 'string') &&
    (record.ip === null || typeof record.ip === 'string') &&
    // Opcional: daemons ya desplegados que todavia no lo mandan siguen
    // funcionando igual.
    (record.connectionType === undefined || typeof record.connectionType === 'string') &&
    // Opcional: solo presente si el daemon tiene API key de geolocalizacion
    // configurada y encontro match para el WiFi visible.
    (record.latitud === undefined || record.latitud === null || typeof record.latitud === 'number') &&
    (record.longitud === undefined || record.longitud === null || typeof record.longitud === 'number') &&
    (record.precisionMetros === undefined || record.precisionMetros === null || typeof record.precisionMetros === 'number') &&
    typeof record.timestamp === 'string' &&
    !Number.isNaN(Date.parse(record.timestamp))
  );
}

function isValidRegistro(registro) {
  const fields = ['computerName', 'codigoActivo', 'rut', 'nombre', 'apellido', 'faena', 'area'];
  return (
    registro &&
    fields.every((field) => typeof registro[field] === 'string' && registro[field].length > 0) &&
    // Opcional: instaladores anteriores al desplegable de turnos no lo mandan.
    (registro.turno === undefined || (typeof registro.turno === 'string' && registro.turno.length > 0))
  );
}

function readBody(req, res) {
  return new Promise((resolve) => {
    let body = '';
    let tooLarge = false;

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        tooLarge = true;
        req.destroy();
      }
    });

    req.on('end', () => {
      if (tooLarge) {
        res.writeHead(413).end();
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        res.writeHead(400).end();
        resolve(null);
      }
    });
  });
}

async function handleDeviceRecords(req, res) {
  const payload = await readBody(req, res);
  if (payload === null) return;

  if (!Array.isArray(payload.records) || !payload.records.every(isValidRecord)) {
    res.writeHead(400).end();
    return;
  }
  // Un equipo solo puede mandar lecturas a su propio nombre.
  if (payload.records.some((record) => record.computerName !== req.equipo)) {
    res.writeHead(403).end();
    return;
  }

  try {
    await insertRecords(req.config, payload.records);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('[backend] error al guardar registros:', err.message);
    res.writeHead(500).end();
  }
}

async function handleEquipoRegistro(req, res) {
  const payload = await readBody(req, res);
  if (payload === null) return;

  if (!isValidRegistro(payload)) {
    res.writeHead(400).end();
    return;
  }
  // Un equipo solo puede registrarse a si mismo.
  if (payload.computerName !== req.equipo) {
    res.writeHead(403).end();
    return;
  }

  try {
    await upsertEquipoRegistro(req.config, payload);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('[backend] error al registrar equipo:', err.message);
    res.writeHead(500).end();
  }
}

async function handleListEquipos(req, res) {
  try {
    const equipos = await getEquiposConUltimaUbicacion(req.config);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ equipos }));
  } catch (err) {
    console.error('[backend] error al listar equipos:', err.message);
    res.writeHead(500).end();
  }
}

async function handleListAreas(req, res) {
  try {
    const areas = await getAreas(req.config);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ areas }));
  } catch (err) {
    console.error('[backend] error al listar areas:', err.message);
    res.writeHead(500).end();
  }
}

async function handleListTurnos(req, res) {
  try {
    const turnos = await getTurnos(req.config);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ turnos }));
  } catch (err) {
    console.error('[backend] error al listar turnos:', err.message);
    res.writeHead(500).end();
  }
}

// La app la consulta cada minuto para saber si el backend esta vivo (p. ej.
// si se detuvo el App Service). No toca la base de datos: no la despierta ni
// gasta cuota del plan serverless.
function handleSalud(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
}

const COMPUTER_NAME_VALIDO = /^[^\u0000-\u001f\u007f]{1,64}$/;

/**
 * Enrolamiento: la app manda su ComputerName la primera vez que se conecta y
 * recibe su token propio, sin codigo ni intervencion de nadie. El instalador
 * no lleva ningun secreto; el token solo permite escribir a ese nombre.
 */
async function handleEnrolar(req, res) {
  if (!req.config.deviceSecret) {
    res.writeHead(503).end();
    return;
  }
  const payload = await readBody(req, res);
  if (payload === null) return;

  if (!payload || typeof payload.computerName !== 'string' || !COMPUTER_NAME_VALIDO.test(payload.computerName)) {
    res.writeHead(400).end();
    return;
  }
  const token = deviceTokenFor(payload.computerName, req.config.deviceSecret);
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ token }));
}

/**
 * Tipos de permiso por ruta:
 * - public: sin credencial (no devuelve datos).
 * - admin: credencial del panel (JWT_SECRET); lee toda la flota.
 * - device: token propio del equipo; el handler solo acepta su ComputerName.
 * - catalog: listas del formulario (areas, turnos): panel o equipo enrolado.
 */
const ROUTES = {
  POST: {
    '/api/equipos/enrolar': { handler: handleEnrolar, permiso: 'public' },
    '/api/device-records': { handler: handleDeviceRecords, permiso: 'device' },
    '/api/equipos/registro': { handler: handleEquipoRegistro, permiso: 'device' },
  },
  GET: {
    '/api/salud': { handler: handleSalud, permiso: 'public' },
    '/api/equipos': { handler: handleListEquipos, permiso: 'admin' },
    '/api/areas': { handler: handleListAreas, permiso: 'catalog' },
    '/api/turnos': { handler: handleListTurnos, permiso: 'catalog' },
  },
};

/** Devuelve el status de rechazo, o null si el request puede seguir. */
function autorizar(req, permiso, config) {
  if (permiso === 'public') return null;
  if (isAuthorized(req, config.jwtSecret)) return permiso === 'device' ? 403 : null;
  if (permiso === 'admin') return 401;

  if (config.deviceSecret) {
    const equipo = getDeviceName(req, config.deviceSecret);
    if (equipo) {
      req.equipo = equipo;
      return null;
    }
  } else if (permiso === 'device') {
    return 503;
  }
  return 401;
}

function createServer(config) {
  return http.createServer((req, res) => {
    // CORS: el panel web que consume esta API corre en otro origen (localhost
    // en desarrollo, o el dominio donde se despliegue despues).
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const route = ROUTES[req.method] && ROUTES[req.method][req.url];
    if (!route) {
      res.writeHead(404).end();
      return;
    }

    const rechazo = autorizar(req, route.permiso, config);
    if (rechazo) {
      res.writeHead(rechazo).end();
      return;
    }

    req.config = config;
    route.handler(req, res);
  });
}

module.exports = { createServer };
