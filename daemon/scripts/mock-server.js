'use strict';

// Servidor local de prueba, SOLO para desarrollo. El daemon real siempre habla HTTPS;
// esto es HTTP en localhost para poder verificar el flujo de envio + cola SQLite sin
// depender del backend real todavia.

const http = require('http');

const PORT = process.env.MOCK_PORT || 4000;
const FAIL_MODE = process.env.MOCK_FAIL === '1';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404).end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const auth = req.headers.authorization || '(sin Authorization)';
    console.log(`[mock-server] ${req.url} auth=${auth}`);
    console.log(`[mock-server] body=${body}`);

    if (FAIL_MODE) {
      console.log('[mock-server] MOCK_FAIL=1 -> respondiendo 503');
      res.writeHead(503).end();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
  });
});

server.listen(PORT, () => {
  console.log(`[mock-server] escuchando en http://localhost:${PORT} (MOCK_FAIL=${FAIL_MODE ? '1' : '0'})`);
});
