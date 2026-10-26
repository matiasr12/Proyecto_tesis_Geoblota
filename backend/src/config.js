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
 *  - JWT_SECRET (obligatoria): credencial del panel web (DAEMON_API_TOKEN del
 *    panel) para leer GET /api/equipos. Nunca va en el instalador de los equipos.
 *  - DEVICE_SECRET (min. 32 caracteres): firma los tokens propios de cada
 *    equipo. Sin el, las rutas de los equipos responden 503 (falla cerrado).
 *  - ENROLLMENT_CODE (min. 12 caracteres): codigo que TI entrega al instalar
 *    la app; con el, el equipo obtiene su token. Sin el, el enrolamiento responde 503.
 *  - PORT (opcional): puerto donde escucha el servidor HTTP, default 3000
 *    (Azure App Service en Linux define PORT automaticamente en produccion)
 */
function optionalSecret(name, minLength) {
  const value = process.env[name];
  if (!value) return null;
  if (value.length < minLength) {
    console.error(`[backend] ${name} tiene menos de ${minLength} caracteres: se ignora`);
    return null;
  }
  return value;
}

function loadConfig() {
  return {
    dbServer: required('DB_SERVER'),
    dbName: required('DB_NAME'),
    dbUser: required('DB_USER'),
    dbPassword: required('DB_PASSWORD'),
    jwtSecret: required('JWT_SECRET'),
    deviceSecret: optionalSecret('DEVICE_SECRET', 32),
    enrollmentCode: optionalSecret('ENROLLMENT_CODE', 12),
    port: Number(process.env.PORT) || 3000,
  };
}

module.exports = { loadConfig };
