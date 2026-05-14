// src/utils/jwt.js
// ─────────────────────────────────────────────────────────────────────────────
// Utilidades para generar y verificar JSON Web Tokens (JWT).
//
// ¿Qué es un JWT?
// Es un token firmado digitalmente que contiene información del usuario.
// Estructura: HEADER.PAYLOAD.SIGNATURE (separados por puntos)
// - Header: algoritmo de firma (HS256)
// - Payload: datos del usuario (id, email, role) — NO incluir password
// - Signature: garantiza que nadie modificó el token
//
// Lo enviamos en una HttpOnly cookie, que JavaScript del browser NO puede leer
// → protege contra ataques XSS (Cross-Site Scripting)
// ─────────────────────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken')

// ── Generar token ─────────────────────────────────────────────────────────────
/**
 * Crea un JWT firmado con los datos del usuario.
 * @param {Object} payload - Datos a incluir en el token (id, email, role)
 * @returns {string} Token JWT firmado
 */
function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

// ── Verificar token ───────────────────────────────────────────────────────────
/**
 * Verifica y decodifica un JWT.
 * Lanza error si el token es inválido o expiró.
 * @param {string} token - JWT a verificar
 * @returns {Object} Payload decodificado
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET)
}

// ── Setear cookie HttpOnly ────────────────────────────────────────────────────
/**
 * Envía el JWT como cookie HttpOnly en la respuesta HTTP.
 *
 * ¿Por qué HttpOnly?
 * - El browser la envía automáticamente en cada request
 * - JavaScript del frontend NO puede leerla (document.cookie no la ve)
 * - Esto previene que scripts maliciosos (XSS) roben el token
 *
 * @param {Object} res - Response de Express
 * @param {string} token - JWT a almacenar en cookie
 */
function setTokenCookie(res, token) {
  res.cookie('auth_token', token, {
    httpOnly: true,                                        // JS no puede leerla
    secure: process.env.NODE_ENV === 'production',        // Solo HTTPS en prod
    sameSite: 'lax',                                      // Protección CSRF básica
    maxAge: 7 * 24 * 60 * 60 * 1000,                     // 7 días en milisegundos
  })
}

// ── Limpiar cookie ────────────────────────────────────────────────────────────
/**
 * Elimina la cookie de autenticación (logout).
 * @param {Object} res - Response de Express
 */
function clearTokenCookie(res) {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
}

module.exports = { generateToken, verifyToken, setTokenCookie, clearTokenCookie }
