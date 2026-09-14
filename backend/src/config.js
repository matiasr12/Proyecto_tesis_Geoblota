'use strict';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

/**
 * Configuracion del backend, leida desde variables de entorno (Azure App Service
 * las inyecta como "Variables de entorno" / Application settings).
 *
 * Variables esperadas:
 *  - DB_SERVER (obligatoria): host del servidor SQL, ej. geoblota.database.windows.net
 *  - DB_NAME (obligatoria): nombre de la base de datos
 *  - DB_USER (obligatoria): usuario administrador del servidor SQL
 *  - DB_PASSWORD (obligatoria): contraseña de ese usuario
 *  - JWT_SECRET (obligatoria): secreto que debe coincidir con JWT_TOKEN del daemon
 *  - PORT (opcional): puerto donde escucha el servidor HTTP, default 3000
 *    (Azure App Service en Linux define PORT automaticamente en produccion)
 */
function loadConfig() {
  return {
    dbServer: required('DB_SERVER'),
    dbName: required('DB_NAME'),
    dbUser: required('DB_USER'),
    dbPassword: required('DB_PASSWORD'),
    jwtSecret: required('JWT_SECRET'),
    port: Number(process.env.PORT) || 3000,
  };
}

module.exports = { loadConfig };
