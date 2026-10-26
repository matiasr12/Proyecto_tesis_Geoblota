'use strict';

// Copiar a secrets.js (nunca se commitea) y completar antes de generar el
// instalador con "npm run build:win". Estos valores quedan dentro del .exe que
// se reparte, asi que NO debe ir aqui ninguna credencial del backend: cada
// equipo obtiene su token propio solo, la primera vez que se conecta
// (ver /api/equipos/enrolar).

module.exports = {
  SERVER_URL: 'https://reemplazar.azurewebsites.net',
  // Opcional: API key de Google Cloud con Geolocation API habilitada. Si se
  // deja null, el instalador sigue funcionando pero lat/long van siempre null.
  // Ojo: tambien queda dentro del .exe; restringirla por API y cuota en Google Cloud.
  GOOGLE_GEOLOCATION_API_KEY: null,
};
