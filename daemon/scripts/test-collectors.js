'use strict';

const { collectSnapshot } = require('../src/collectors');

collectSnapshot()
  .then((snapshot) => {
    console.log(JSON.stringify(snapshot, null, 2));
  })
  .catch((error) => {
    console.error('Fallo al recolectar el snapshot:', error);
    process.exitCode = 1;
  });
