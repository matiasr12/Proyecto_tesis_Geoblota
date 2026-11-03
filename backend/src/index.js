'use strict';

const { loadConfig } = require('./config');
const { createServer } = require('./server');
const { aprenderBssids } = require('./db');

// Cada cuanto se reasignan a su area los APs que nadie registro a mano.
const APRENDER_CADA_MS = 30 * 60 * 1000;

const config = loadConfig();
const server = createServer(config);

server.listen(config.port, () => {
  console.log(`[backend] escuchando en el puerto ${config.port}`);
});

async function aprender() {
  try {
    const total = await aprenderBssids(config);
    console.log(`[backend] aprendizaje de APs: ${total} APs asignados a su area`);
  } catch (err) {
    console.error('[backend] aprendizaje de APs fallo:', err.message);
  }
}
// Primera vez al minuto de arrancar, para no competir con la conexion inicial.
setTimeout(aprender, 60 * 1000);
setInterval(aprender, APRENDER_CADA_MS);
