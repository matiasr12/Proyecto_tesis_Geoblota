'use strict';

// Copiar a secrets.js (nunca se commitea) y completar antes de generar el
// instalador con "npm run build:win". Estos valores quedan compilados dentro
// del .exe que se reparte, pero nunca en el codigo fuente del repositorio
// (que es publico).

module.exports = {
  SERVER_URL: 'https://reemplazar.azurewebsites.net',
  JWT_TOKEN: 'reemplazar-con-el-mismo-JWT_SECRET-del-backend',
};
