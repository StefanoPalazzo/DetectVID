// src/routes/analysisRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Rutas para el recurso Analysis.
// Todas requieren autenticación — no hay endpoints públicos de análisis.
//
// Orden de rutas DELETE: primero DELETE / (bulk) y luego DELETE /:id
// Esto es IMPORTANTE: Express matchea en orden, y si /:id va primero,
// un DELETE sin ID podría comportarse de forma inesperada.
// ─────────────────────────────────────────────────────────────────────────────

const { Router } = require('express')
const { body }   = require('express-validator')
const multer     = require('multer')

const { create, list, deleteOne, deleteMany } = require('../controllers/analysisController')
const { authenticate } = require('../middleware/authMiddleware')

const router = Router()

// multer con storage en memoria (el Buffer se pasa al provider de storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB máximo
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true)
    cb(new Error('Solo se permiten imágenes.'), false)
  },
})

// Validaciones
const validateCreate = [
  body('result').notEmpty().withMessage('El resultado del análisis es obligatorio.'),
]

// Todas las rutas requieren autenticación
router.use(authenticate)

router.post('/',   upload.single('image'), validateCreate, create)
router.get('/',    list)
router.delete('/', deleteMany)           // DELETE con body { ids: [] } — ANTES del :id
router.delete('/:id', deleteOne)

module.exports = router
