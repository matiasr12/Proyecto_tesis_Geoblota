'use strict';

const crypto = require('crypto');

/**
 * Valida el header "Authorization: Bearer <token>" contra JWT_SECRET.
 * Usa timingSafeEqual para no filtrar el secreto via timing attack.
 */
function isAuthorized(req, jwtSecret) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;

  const received = Buffer.from(match[1]);
  const expected = Buffer.from(jwtSecret);
  if (received.length !== expected.length) return false;

  return crypto.timingSafeEqual(received, expected);
}

module.exports = { isAuthorized };
