'use strict';

const crypto = require('crypto');

function bearer(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

/**
 * Compara dos cadenas en tiempo constante. Compara sus SHA-256 (siempre 32
 * bytes) para no filtrar ni siquiera la longitud del secreto.
 */
function safeEqual(a, b) {
  const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

/**
 * Credencial del panel (lectura de toda la flota): "Authorization: Bearer
 * <JWT_SECRET>". Nunca se empaqueta en el instalador de los equipos.
 */
function isAuthorized(req, jwtSecret) {
  const token = bearer(req);
  return token !== null && safeEqual(token, jwtSecret);
}

/**
 * Token propio de un equipo: "<nombre en base64url>.<HMAC-SHA256>". Se
 * calcula con DEVICE_SECRET (que nunca sale del backend), asi que no hace
 * falta guardarlo en la base y solo vale para ese ComputerName.
 */
function deviceTokenFor(computerName, deviceSecret) {
  const nombre = Buffer.from(computerName, 'utf8').toString('base64url');
  const firma = crypto.createHmac('sha256', deviceSecret).update(`equipo:${computerName}`).digest('hex');
  return `${nombre}.${firma}`;
}

/**
 * Devuelve el ComputerName al que pertenece el token de equipo del request,
 * o null si no hay token o la firma no corresponde.
 */
function getDeviceName(req, deviceSecret) {
  const token = bearer(req);
  if (!token) return null;
  const punto = token.lastIndexOf('.');
  if (punto < 1) return null;
  const computerName = Buffer.from(token.slice(0, punto), 'base64url').toString('utf8');
  if (!computerName) return null;
  return safeEqual(token, deviceTokenFor(computerName, deviceSecret)) ? computerName : null;
}

/** El codigo que TI entrega al instalar, comparado en tiempo constante. */
function isValidEnrollmentCode(codigo, enrollmentCode) {
  return typeof codigo === 'string' && codigo.length > 0 && safeEqual(codigo, enrollmentCode);
}

module.exports = { isAuthorized, deviceTokenFor, getDeviceName, isValidEnrollmentCode };
