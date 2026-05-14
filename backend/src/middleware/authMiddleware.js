// src/middleware/authMiddleware.js
// ─────────────────────────────────────────────────────────────────────────────
// Middleware de autenticación: protege rutas que requieren sesión activa.
//
// ¿Qué es un middleware?
// Es una función que se ejecuta ANTES del controller, en el pipeline de Express.
// Puede: leer datos del request, modificarlos, o cortar la cadena con un error.
//
// Flujo: Request → authMiddleware → controller (solo si token válido)
// ─────────────────────────────────────────────────────────────────────────────

const { verifyToken } = require('../utils/jwt')

/**
 * Verifica que el request tenga un JWT válido en la cookie.
 * Si es válido, agrega req.user = { id, email, role } para el controller.
 * Si no, responde 401 Unauthorized.
 */
function authenticate(req, res, next) {
  // Leer token desde la cookie HttpOnly
  const token = req.cookies?.auth_token

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No autenticado. Iniciá sesión para continuar.',
    })
  }

  try {
    // Verificar firma y expiración
    const decoded = verifyToken(token)

    // Adjuntar datos del usuario al request para que el controller los use
    req.user = {
      id:    decoded.id,
      email: decoded.email,
      role:  decoded.role,
    }

    next() // Continuar al controller
  } catch (error) {
    // Token inválido, expirado o manipulado
    return res.status(401).json({
      success: false,
      message: 'Sesión inválida o expirada. Iniciá sesión nuevamente.',
    })
  }
}

/**
 * Middleware de autorización por rol.
 * Usar DESPUÉS de authenticate.
 * Ejemplo: router.get('/admin', authenticate, authorize('ADMIN'), controller)
 *
 * @param {...string} roles - Roles permitidos para la ruta
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: 'No tenés permisos para acceder a este recurso.',
      })
    }
    next()
  }
}

module.exports = { authenticate, authorize }
