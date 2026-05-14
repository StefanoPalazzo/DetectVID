// src/server.js
// ─────────────────────────────────────────────────────────────────────────────
// Punto de entrada del servidor Express para DetectVID.
// Configura todos los middlewares de seguridad y monta las rutas.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config() // Cargar variables de .env PRIMERO que todo lo demás

const express      = require('express')
const cors         = require('cors')
const helmet       = require('helmet')
const cookieParser = require('cookie-parser')
const morgan       = require('morgan')
const rateLimit    = require('express-rate-limit')
const path         = require('path')

const prisma         = require('./lib/prisma')
const authRoutes     = require('./routes/authRoutes')
const analysisRoutes = require('./routes/analysisRoutes')
const fincaRoutes    = require('./routes/fincaRoutes')

const app  = express()
const PORT = process.env.PORT || 3001

// ── Middlewares de seguridad ──────────────────────────────────────────────────

// Helmet: agrega headers HTTP de seguridad automáticamente
// (X-Frame-Options, X-Content-Type-Options, etc.)
app.use(helmet())

// CORS: solo permite requests desde el frontend de React
// credentials: true es OBLIGATORIO para que las cookies funcionen cross-origin
app.use(cors({
  origin:      process.env.FRONTEND_URLS?.split(',') || ['http://localhost:5173'],
  credentials: true, // ← sin esto, las cookies no se envían/reciben
  methods:     ['GET', 'POST', 'PUT', 'DELETE'],
}))

// Rate limiting: limita la cantidad de requests para prevenir abuso y ataques de fuerza bruta
// Aplica a todas las rutas de auth (login/register son los targets principales)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ventana de 15 minutos
  max:      20,              // máximo 20 requests por IP en esa ventana
  message: {
    success: false,
    message: 'Demasiados intentos. Esperá 15 minutos e intentá de nuevo.',
  },
  standardHeaders: true,
  legacyHeaders:   false,
})

// ── Middlewares de parsing ────────────────────────────────────────────────────

// Límite aumentado a 1mb: el resultado JSON del análisis de IA puede ser extenso.
// Las imágenes van como multipart (multer), no como JSON, así que 1mb es suficiente.
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(cookieParser())                       // Parsear cookies (necesario para leer auth_token)

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev')) // Logs coloridos en desarrollo: GET /api/auth/me 200 5ms
}

// ── Rutas ─────────────────────────────────────────────────────────────────────

// Health check — para verificar que el servidor está corriendo
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Rutas de autenticación con rate limiter aplicado
app.use('/api/auth', authLimiter, authRoutes)

// Rutas de análisis — requieren authenticate (aplicado en el router)
app.use('/api/analyses', analysisRoutes)

// Rutas de fincas — requieren authenticate (aplicado en el router)
app.use('/api/fincas', fincaRoutes)

// Servir imágenes subidas con el provider "local"
// En producción con Cloudinary este middleware es ignorado (las URLs apuntan a CDN)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// ── Manejo de rutas no encontradas ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Ruta ${req.path} no encontrada.` })
})

// ── Manejo global de errores ──────────────────────────────────────────────────
// Express lo reconoce como error handler por los 4 parámetros (err, req, res, next)
app.use((err, req, res, next) => {
  console.error('[ERROR]', err)
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor.',
    // err.message NUNCA en producción — podría filtrar rutas, queries, etc.
  })
})

// ── Iniciar servidor ──────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  try {
    await prisma.$connect()
    console.log(`\n🍇 DetectVID Backend corriendo en http://localhost:${PORT}`)
    console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`)
    console.log(`   Health:  http://localhost:${PORT}/health\n`)
  } catch (err) {
    console.error('❌ No se pudo conectar a la base de datos:', err.message)
    process.exit(1)
  }
})
