'use strict';

const http = require('http');
const { isAuthorized } = require('./auth');
const { insertRecords } = require('./db');

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

function createServer(config) {
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/device-records') {
      res.writeHead(404).end();
      return;
    }

    if (!isAuthorized(req, config.jwtSecret)) {
      res.writeHead(401).end();
      return;
    }

    let body = '';
    let tooLarge = false;

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        tooLarge = true;
        req.destroy();
      }
    });

    req.on('end', async () => {
      if (tooLarge) {
        res.writeHead(413).end();
        return;
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400).end();
        return;
      }

      if (!Array.isArray(payload.records) || !payload.records.every(isValidRecord)) {
        res.writeHead(400).end();
        return;
      }

      try {
        await insertRecords(config, payload.records);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('[backend] error al guardar registros:', err.message);
        res.writeHead(500).end();
      }
    });
  });
}

module.exports = { createServer };
