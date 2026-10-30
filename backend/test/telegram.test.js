'use strict';

// Aviso de alertas por Telegram, con fetch simulado: no llama a Telegram.

const test = require('node:test');
const assert = require('node:assert');
const { notificarAlertaAbierta } = require('../src/telegram');

const CONFIG = { telegramBotToken: '123:TOKEN-SECRETO-DE-PRUEBA', telegramChatId: '8465616872' };
const datos = (equipoId, extra = {}) => ({
  equipoId,
  computerName: 'PC-<A&B>',
  nombre: 'Matias',
  apellido: 'Reinoso',
  areaAsignada: 'Garita',
  areaDetectada: 'Dormitorios',
  fechaInicio: new Date('2026-10-29T13:44:00Z'),
  ...extra,
});

function simularFetch(respuesta = { ok: true }) {
  const llamadas = [];
  global.fetch = async (url, init) => {
    llamadas.push({ url, body: JSON.parse(init.body) });
    if (respuesta instanceof Error) throw respuesta;
    return { ok: respuesta.ok, status: respuesta.status, json: async () => ({ description: 'Bad Request' }) };
  };
  return llamadas;
}

function capturarConsola(metodo) {
  const lineas = [];
  const original = console[metodo];
  console[metodo] = (...args) => lineas.push(args.join(' '));
  return { lineas, restaurar: () => { console[metodo] = original; } };
}

test('arma el mensaje con HTML escapado y hora de Chile', async () => {
  const llamadas = simularFetch();
  await notificarAlertaAbierta(datos(1), CONFIG);
  assert.strictEqual(llamadas.length, 1);
  const { body } = llamadas[0];
  assert.strictEqual(body.chat_id, '8465616872');
  assert.strictEqual(body.parse_mode, 'HTML');
  assert.strictEqual(body.disable_web_page_preview, true);
  assert.match(body.text, /💻 <b>PC-&lt;A&amp;B&gt;<\/b>/);
  assert.match(body.text, /👤 Matias Reinoso/);
  assert.match(body.text, /📍 Fuera de: Garita \/ Dormitorios/);
  assert.match(body.text, /🕐 29-10-2026 10:44/); // UTC-3 en octubre
  assert.match(body.text, /<a href="https:\/\/geoflota-panel-.*\/alerts">Ver en el panel<\/a>/);
});

test('sin personal asignado dice "Sin asignar"', async () => {
  const llamadas = simularFetch();
  await notificarAlertaAbierta(datos(2, { nombre: null, apellido: null, areaDetectada: null }), CONFIG);
  assert.match(llamadas[0].body.text, /👤 Sin asignar/);
  assert.match(llamadas[0].body.text, /📍 Fuera de: Garita\n/);
});

test('antispam: el mismo equipo en menos de 5 min avisa una sola vez', async () => {
  const llamadas = simularFetch();
  await notificarAlertaAbierta(datos(3), CONFIG);
  await notificarAlertaAbierta(datos(3), CONFIG);
  await notificarAlertaAbierta(datos(4), CONFIG);
  assert.deepStrictEqual(llamadas.map((l) => l.body.text.includes('PC-')), [true, true]);
  assert.strictEqual(llamadas.length, 2); // equipo 3 una vez + equipo 4
});

test('si Telegram falla no lanza error y el token no aparece en el log', async () => {
  const consola = capturarConsola('error');
  try {
    simularFetch({ ok: false, status: 400 });
    await notificarAlertaAbierta(datos(5), CONFIG);
    simularFetch(new TypeError(`fetch failed https://api.telegram.org/bot${CONFIG.telegramBotToken}`));
    await notificarAlertaAbierta(datos(6), CONFIG);
  } finally {
    consola.restaurar();
  }
  assert.strictEqual(consola.lineas.length, 2);
  for (const linea of consola.lineas) assert.ok(!linea.includes('TOKEN-SECRETO'), linea);
});

test('sin credenciales no llama a Telegram y advierte una sola vez', async () => {
  const llamadas = simularFetch();
  const consola = capturarConsola('warn');
  try {
    await notificarAlertaAbierta(datos(7), {});
    await notificarAlertaAbierta(datos(8), { telegramBotToken: 'x' });
  } finally {
    consola.restaurar();
  }
  assert.strictEqual(llamadas.length, 0);
  assert.strictEqual(consola.lineas.length, 1);
});
