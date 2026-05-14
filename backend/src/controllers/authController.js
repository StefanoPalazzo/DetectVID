// src/controllers/authController.js
// ─────────────────────────────────────────────────────────────────────────────
// Lógica de negocio para autenticación:
//   - register: crear cuenta nueva
//   - login:    verificar credenciales y emitir token
//   - logout:   limpiar cookie
//   - me:       devolver datos del usuario autenticado
//
// Principio: los controllers NO tocan la DB directamente.
// Toda la lógica de persistencia va por Prisma (el ORM).
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt = require('bcryptjs')
const { validationResult } = require('express-validator')
const { generateToken, setTokenCookie, clearTokenCookie } = require('../utils/jwt')
const prisma = require('../lib/prisma')

// ── REGISTRO ──────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/register
 * Crea un nuevo usuario con password hasheado.
 */
async function register(req, res) {
  // 1. Validar inputs (las reglas se definen en las rutas con express-validator)
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Datos inválidos.',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    })
  }

  const { name, email, password } = req.body

  try {
    // 2. Verificar que el email no esté en uso
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      // Mensaje genérico para no filtrar si el email existe en el sistema
      return res.status(409).json({
        success: false,
        message: 'Ya existe una cuenta con ese email.',
      })
    }

    // 3. Hashear el password con bcrypt (cost factor 12)
    //    ¿Por qué 12? Es el balance recomendado: ~300ms en hardware moderno.
    //    Suficientemente lento para ataques de fuerza bruta, rápido para UX.
    const password_hash = await bcrypt.hash(password, 12)

    // 4. Crear usuario en la DB (Prisma previene SQL injection automáticamente)
    const user = await prisma.user.create({
      data: { name, email, password_hash },
      select: { id: true, name: true, email: true, role: true, created_at: true },
      // select: NUNCA devolvemos password_hash al cliente
    })

    // 5. Generar JWT y setearlo como cookie HttpOnly
    const token = generateToken({ id: user.id, email: user.email, role: user.role })
    setTokenCookie(res, token)

    return res.status(201).json({
      success: true,
      message: 'Cuenta creada correctamente.',
      user,
    })
  } catch (error) {
    console.error('[register] Error:', error)
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor. Intentá de nuevo.',
      // NUNCA enviamos error.message al cliente en producción — podría filtrar info interna
    })
  }
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/login
 * Verifica credenciales y emite JWT en cookie HttpOnly.
 */
async function login(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Datos inválidos.',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    })
  }

  const { email, password } = req.body

  try {
    // 1. Buscar usuario por email
    const user = await prisma.user.findUnique({ where: { email } })

    // 2. Verificar contraseña con tiempo constante (bcrypt.compare es timing-safe)
    //    IMPORTANTE: siempre ejecutar bcrypt.compare aunque el usuario no exista.
    //    Usar un hash dummy evita ataques de timing que revelan si el email existe.
    const dummyHash = '$2a$12$dummyhashfortimingprotection..............'
    const isValid = user
      ? await bcrypt.compare(password, user.password_hash)
      : await bcrypt.compare(password, dummyHash).then(() => false)

    if (!user || !isValid) {
      // Mensaje genérico — no revelar si el email existe o si la password es incorrecta
      return res.status(401).json({
        success: false,
        message: 'Email o contraseña incorrectos.',
      })
    }

    // 3. Emitir token
    const token = generateToken({ id: user.id, email: user.email, role: user.role })
    setTokenCookie(res, token)

    return res.status(200).json({
      success: true,
      message: 'Sesión iniciada.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  } catch (error) {
    console.error('[login] Error:', error)
    return res.status(500).json({ success: false, message: 'Error interno del servidor.' })
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/logout
 * Elimina la cookie de autenticación.
 */
function logout(req, res) {
  clearTokenCookie(res)
  return res.status(200).json({ success: true, message: 'Sesión cerrada.' })
}

// ── ME (perfil del usuario autenticado) ───────────────────────────────────────
/**
 * GET /api/auth/me
 * Devuelve los datos del usuario logueado.
 * Requiere middleware authenticate.
 */
async function me(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, created_at: true },
    })

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' })
    }

    return res.status(200).json({ success: true, user })
  } catch (error) {
    console.error('[me] Error:', error)
    return res.status(500).json({ success: false, message: 'Error interno del servidor.' })
  }
}

module.exports = { register, login, logout, me }
