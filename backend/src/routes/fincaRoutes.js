// src/routes/fincaRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Rutas para el recurso Finca (zonas del viñedo).
// CRUD completo con validaciones en capa de rutas.
// ─────────────────────────────────────────────────────────────────────────────

const { Router } = require('express')
const { body }   = require('express-validator')

const { list, create, update, deleteOne } = require('../controllers/fincaController')
const { authenticate } = require('../middleware/authMiddleware')

const router = Router()

const validateFinca = [
  body('name')
    .trim().notEmpty().withMessage('El nombre de la finca es obligatorio.')
    .isLength({ max: 100 }).withMessage('Máximo 100 caracteres.'),
  body('coordinates')
    .isArray({ min: 3 }).withMessage('Una finca necesita al menos 3 puntos para formar un polígono.'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('El color debe ser un hex válido (#RRGGBB).'),
]

router.use(authenticate)

router.get('/',       list)
router.post('/',      validateFinca, create)
router.put('/:id',    validateFinca, update)
router.delete('/:id', deleteOne)

module.exports = router
