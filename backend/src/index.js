'use strict';

const { loadConfig } = require('./config');
const { createServer } = require('./server');

const config = loadConfig();
const server = createServer(config);

server.listen(config.port, () => {
  console.log(`[backend] escuchando en el puerto ${config.port}`);
});
