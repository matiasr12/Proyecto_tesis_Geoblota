'use strict';

// Pruebas de regresion de la auditoria de seguridad (run-1): el token de un
// equipo no debe leer la flota ni escribir a nombre de otro equipo, y el
// secreto del panel no debe servir en las rutas de los equipos.
// Usan una base de datos simulada: no necesitan Azure ni mssql.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const llamadas = [];
const dbFalsa = {
  insertRecords: async (config, records) => llamadas.push(['insertRecords', records]),
  upsertEquipoRegistro: async (config, datos) => llamadas.push(['upsertEquipoRegistro', datos]),
  getEquiposConUltimaUbicacion: async () => [{ computerName: 'PC-A', rut: '1-9' }],
  getAreas: async () => [{ faena: 'F', area: 'A' }],
  getTurnos: async () => [{ nombre: 'T' }],
};
require.cache[require.resolve(path.join(__dirname, '..', 'src', 'db.js'))] = { exports: dbFalsa };

const { createServer } = require('../src/server');
const { deviceTokenFor } = require('../src/auth');

const CONFIG = {
  jwtSecret: 'secreto-del-panel-solo-para-pruebas-0123456789',
  deviceSecret: 'secreto-de-equipos-solo-para-pruebas-0123456789',
  enrollmentCode: 'CODIGO-TI-PRUEBA-2026',
};

async function conServidor(config, fn) {
  const server = createServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function pedir(base, metodo, ruta, { token, cuerpo, codigo } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (codigo) headers['X-Codigo-Enrolamiento'] = codigo;
  return fetch(base + ruta, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
}

const lectura = (computerName) => ({
  computerName, bssids: [], ip: null, latitud: -28.15, longitud: -69.78, timestamp: '2026-10-26T12:00:00Z',
});
const registro = (computerName) => ({
  computerName, codigoActivo: 'ACT-1', rut: '1-9', nombre: 'N', apellido: 'A', faena: 'F', area: 'A',
});

test('sin token: las rutas protegidas responden 401', () => conServidor(CONFIG, async (base) => {
  assert.strictEqual((await pedir(base, 'GET', '/api/equipos')).status, 401);
  assert.strictEqual((await pedir(base, 'POST', '/api/device-records', { cuerpo: { records: [lectura('PC-A')] } })).status, 401);
  assert.strictEqual((await pedir(base, 'GET', '/api/areas')).status, 401);
}));

test('salud es publica y no devuelve datos', () => conServidor(CONFIG, async (base) => {
  const res = await pedir(base, 'GET', '/api/salud');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true });
}));

test('panel: lee la flota, pero su secreto no sirve en las rutas de equipos', () => conServidor(CONFIG, async (base) => {
  assert.strictEqual((await pedir(base, 'GET', '/api/equipos', { token: CONFIG.jwtSecret })).status, 200);
  const res = await pedir(base, 'POST', '/api/device-records', { token: CONFIG.jwtSecret, cuerpo: { records: [lectura('PC-A')] } });
  assert.strictEqual(res.status, 403);
}));

test('enrolamiento: codigo incorrecto 401, correcto entrega el token del equipo', () => conServidor(CONFIG, async (base) => {
  const malo = await pedir(base, 'POST', '/api/equipos/enrolar', { cuerpo: { computerName: 'PC-A', codigo: 'otro' } });
  assert.strictEqual(malo.status, 401);
  const bueno = await pedir(base, 'POST', '/api/equipos/enrolar', { cuerpo: { computerName: 'PC-A', codigo: CONFIG.enrollmentCode } });
  assert.strictEqual(bueno.status, 200);
  assert.strictEqual((await bueno.json()).token, deviceTokenFor('PC-A', CONFIG.deviceSecret));
}));

test('token de equipo: no puede leer la flota (hallazgo 2)', () => conServidor(CONFIG, async (base) => {
  const token = deviceTokenFor('PC-A', CONFIG.deviceSecret);
  assert.strictEqual((await pedir(base, 'GET', '/api/equipos', { token })).status, 401);
}));

test('token de equipo: escribe solo a su nombre (hallazgo 2)', () => conServidor(CONFIG, async (base) => {
  const token = deviceTokenFor('PC-A', CONFIG.deviceSecret);
  llamadas.length = 0;
  assert.strictEqual((await pedir(base, 'POST', '/api/device-records', { token, cuerpo: { records: [lectura('PC-A')] } })).status, 200);
  assert.strictEqual((await pedir(base, 'POST', '/api/device-records', { token, cuerpo: { records: [lectura('PC-A'), lectura('PC-B')] } })).status, 403);
  assert.strictEqual((await pedir(base, 'POST', '/api/equipos/registro', { token, cuerpo: registro('PC-B') })).status, 403);
  assert.strictEqual((await pedir(base, 'POST', '/api/equipos/registro', { token, cuerpo: registro('PC-A') })).status, 200);
  assert.deepStrictEqual(llamadas.map((l) => l[0]), ['insertRecords', 'upsertEquipoRegistro']);
}));

test('token alterado o firmado con otro secreto: 401', () => conServidor(CONFIG, async (base) => {
  const [, firma] = deviceTokenFor('PC-A', CONFIG.deviceSecret).split('.');
  const otroNombre = `${Buffer.from('PC-B').toString('base64url')}.${firma}`;
  const otroSecreto = deviceTokenFor('PC-A', 'otro-secreto-cualquiera-0123456789abcdef');
  for (const token of [otroNombre, otroSecreto, 'basura', '.']) {
    assert.strictEqual((await pedir(base, 'POST', '/api/device-records', { token, cuerpo: { records: [lectura('PC-A')] } })).status, 401);
  }
}));

test('listas del formulario: con codigo de TI o token de equipo', () => conServidor(CONFIG, async (base) => {
  assert.strictEqual((await pedir(base, 'GET', '/api/areas', { codigo: CONFIG.enrollmentCode })).status, 200);
  assert.strictEqual((await pedir(base, 'GET', '/api/turnos', { codigo: 'otro' })).status, 401);
  assert.strictEqual((await pedir(base, 'GET', '/api/turnos', { token: deviceTokenFor('PC-A', CONFIG.deviceSecret) })).status, 200);
}));

test('sin DEVICE_SECRET ni ENROLLMENT_CODE configurados: falla cerrado con 503', () => conServidor({ jwtSecret: CONFIG.jwtSecret, deviceSecret: null, enrollmentCode: null }, async (base) => {
  assert.strictEqual((await pedir(base, 'POST', '/api/equipos/enrolar', { cuerpo: { computerName: 'PC-A', codigo: 'x' } })).status, 503);
  assert.strictEqual((await pedir(base, 'POST', '/api/device-records', { token: 'cualquiera', cuerpo: { records: [] } })).status, 503);
  assert.strictEqual((await pedir(base, 'GET', '/api/equipos', { token: CONFIG.jwtSecret })).status, 200);
}));
