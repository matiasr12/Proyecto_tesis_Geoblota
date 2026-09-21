'use strict';

const http = require('http');
const { isAuthorized } = require('./auth');
const { insertRecords, upsertEquipoRegistro } = require('./db');

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB, de sobra para un lote de registros

function isValidRecord(record) {
  return (
    record &&
    typeof record.computerName === 'string' &&
    Array.isArray(record.bssids) &&
    record.bssids.every((b) => typeof b === 'string') &&
    (record.ip === null || typeof record.ip === 'string') &&
    typeof record.timestamp === 'string' &&
    !Number.isNaN(Date.parse(record.timestamp))
  );
}

function isValidRegistro(registro) {
  const fields = ['computerName', 'codigoActivo', 'rut', 'nombre', 'apellido', 'faena', 'area'];
  return registro && fields.every((field) => typeof registro[field] === 'string' && registro[field].length > 0);
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

  try {
    await upsertEquipoRegistro(req.config, payload);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('[backend] error al registrar equipo:', err.message);
    res.writeHead(500).end();
  }
}

const ROUTES = {
  '/api/device-records': handleDeviceRecords,
  '/api/equipos/registro': handleEquipoRegistro,
};

function createServer(config) {
  return http.createServer((req, res) => {
    const handler = req.method === 'POST' ? ROUTES[req.url] : null;
    if (!handler) {
      res.writeHead(404).end();
      return;
    }

    if (!isAuthorized(req, config.jwtSecret)) {
      res.writeHead(401).end();
      return;
    }

    req.config = config;
    handler(req, res);
  });
}

module.exports = { createServer };
