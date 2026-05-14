// src/routes/authRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Define los endpoints de autenticación y sus reglas de validación.
//
// express-validator: biblioteca que valida y sanitiza inputs ANTES de que
// lleguen al controller. Si algo falla, el controller lo detecta con
// validationResult(req) y responde 422 sin ejecutar lógica de negocio.
// ─────────────────────────────────────────────────────────────────────────────

const { Router } = require('express')
const { body }   = require('express-validator')

const { register, login, logout, me } = require('../controllers/authController')
const { authenticate }                = require('../middleware/authMiddleware')

const router = Router()

// ── Reglas de validación reutilizables ────────────────────────────────────────

const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio.')
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres.'),

  body('email')
    .trim()
    .notEmpty().withMessage('El email es obligatorio.')
    .isEmail().withMessage('El email no es válido.')
    .normalizeEmail(), // convierte a minúsculas y normaliza

  body('password')
    .notEmpty().withMessage('La contraseña es obligatoria.')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.')
    .matches(/[A-Z]/).withMessage('Debe contener al menos una letra mayúscula.')
    .matches(/[0-9]/).withMessage('Debe contener al menos un número.'),
]

const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('El email es obligatorio.')
    .isEmail().withMessage('El email no es válido.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('La contraseña es obligatoria.'),
]

// ── Rutas ─────────────────────────────────────────────────────────────────────

// POST /api/auth/register — crear cuenta
router.post('/register', validateRegister, register)

// POST /api/auth/login — iniciar sesión
router.post('/login', validateLogin, login)

// POST /api/auth/logout — cerrar sesión (no requiere auth para poder cerrar sesión expirada)
router.post('/logout', logout)

// GET /api/auth/me — datos del usuario autenticado (requiere token válido)
router.get('/me', authenticate, me)

module.exports = router
