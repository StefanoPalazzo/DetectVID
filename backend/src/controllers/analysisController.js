// src/controllers/analysisController.js
// ─────────────────────────────────────────────────────────────────────────────
// Controlador para análisis de hojas.
// Maneja la creación, listado y eliminación de análisis por usuario.
// SIEMPRE filtra por req.user.id — nunca accede a datos de otros usuarios.
// ─────────────────────────────────────────────────────────────────────────────

const { validationResult } = require('express-validator')
const storage              = require('../storage')
const prisma               = require('../lib/prisma')

// ── CREAR ANÁLISIS ────────────────────────────────────────────────────────────
/**
 * POST /api/analyses
 * Recibe la imagen (via multer) y el resultado JSON del análisis.
 * Sube la imagen al storage configurado y persiste el resultado en la DB.
 */
async function create(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Datos inválidos.',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    })
  }

  // La imagen viene del middleware multer (en memoria como Buffer)
  if (!req.file) {
    return res.status(422).json({ success: false, message: 'La imagen es obligatoria.' })
  }

  try {
    const userId = req.user.id
    const result = JSON.parse(req.body.result) // el resultado viene como string JSON

    // 1. Subir imagen al storage (Cloudinary, local, etc.)
    const uploaded = await storage.upload(req.file.buffer, {
      folder:   `detectvid/users/${userId}`,
      filename: `${result.analysisId}-${Date.now()}`,
    })

    // 2. Parsear coordenadas GPS (opcionales)
    const latitude  = req.body.latitude  ? parseFloat(req.body.latitude)  : null
    const longitude = req.body.longitude ? parseFloat(req.body.longitude) : null

    // 3. Persistir en la DB
    const analysis = await prisma.analysis.create({
      data: {
        userId,
        imageUrl:      uploaded.url,
        imageProvider: uploaded.provider,
        // Resultado del modelo
        disease:        result.result.disease,
        diseaseKey:     result.result.diseaseKey,
        status:         result.result.status,
        confidence:     result.result.confidence,
        riskLevel:      result.result.riskLevel,
        riskColor:      result.result.riskColor,
        affectedArea:   result.result.affectedArea,
        urgency:        result.result.urgency,
        symptoms:       result.result.symptoms,
        recommendation: result.result.recommendation,
        // GPS
        latitude,
        longitude,
        // Metadata
        analysisId:     result.analysisId,
        processingTime: result.processingTime,
        modelName:      result.model?.name || 'DetectVID-Mock-v1',
      },
    })

    return res.status(201).json({ success: true, analysis })
  } catch (error) {
    console.error('[analysisController.create]', error)
    return res.status(500).json({ success: false, message: 'Error al guardar el análisis.' })
  }
}

// ── LISTAR ANÁLISIS DEL USUARIO ───────────────────────────────────────────────
/**
 * GET /api/analyses
 * Devuelve TODOS los análisis del usuario autenticado.
 * Soporta filtros opcionales: ?disease=powdery_mildew&from=2025-01-01&to=2025-12-31
 * La agrupación por día/semana/mes se hace en el frontend con date-fns.
 */
async function list(req, res) {
  try {
    const userId = req.user.id
    const { disease, from, to, page = 1, limit = 100 } = req.query

    // Construir filtros dinámicamente
    const where = { userId }
    if (disease) where.diseaseKey = disease
    if (from || to) {
      where.created_at = {}
      if (from) where.created_at.gte = new Date(from)
      if (to)   where.created_at.lte = new Date(to)
    }

    const raw = await prisma.analysis.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip:    (parseInt(page) - 1) * parseInt(limit),
      take:    parseInt(limit),
      select: {
        id: true, imageUrl: true, disease: true, diseaseKey: true,
        status: true, confidence: true, riskLevel: true, riskColor: true,
        affectedArea: true, urgency: true, symptoms: true, recommendation: true,
        latitude: true, longitude: true,
        analysisId: true, processingTime: true, modelName: true,
        created_at: true,
      },
    })

    // Normalizar a camelCase para consistencia con el frontend
    const analyses = raw.map(a => ({
      ...a,
      diseaseName: a.disease,   // alias legible para la UI
      createdAt:   a.created_at,
    }))

    const total = await prisma.analysis.count({ where })

    return res.status(200).json({ success: true, analyses, total, page: parseInt(page) })
  } catch (error) {
    console.error('[analysisController.list]', error)
    return res.status(500).json({ success: false, message: 'Error al obtener el historial.' })
  }
}

// ── ELIMINAR UN ANÁLISIS ──────────────────────────────────────────────────────
/**
 * DELETE /api/analyses/:id
 * Elimina un análisis. Verifica que pertenezca al usuario autenticado.
 */
async function deleteOne(req, res) {
  try {
    const userId = req.user.id
    const { id } = req.params

    // Buscar y verificar ownership en una sola query
    const analysis = await prisma.analysis.findFirst({
      where: { id, userId },
      select: { id: true, imageUrl: true, imageProvider: true },
    })

    if (!analysis) {
      return res.status(404).json({ success: false, message: 'Análisis no encontrado.' })
    }

    // Eliminar imagen del storage
    // Nota: si el storage falla, igual eliminamos el registro de la DB
    try {
      const publicId = extractPublicId(analysis.imageUrl, analysis.imageProvider)
      await storage.delete(publicId)
    } catch (storageErr) {
      console.error('[analysisController.deleteOne] Storage delete failed:', storageErr)
    }

    await prisma.analysis.delete({ where: { id } })

    return res.status(200).json({ success: true, message: 'Análisis eliminado.' })
  } catch (error) {
    console.error('[analysisController.deleteOne]', error)
    return res.status(500).json({ success: false, message: 'Error al eliminar el análisis.' })
  }
}

// ── ELIMINAR MÚLTIPLES ANÁLISIS ───────────────────────────────────────────────
/**
 * DELETE /api/analyses
 * Body: { ids: ['id1', 'id2', ...] }
 * Elimina múltiples análisis del usuario. Verifica ownership de todos.
 */
async function deleteMany(req, res) {
  try {
    const userId = req.user.id
    const { ids } = req.body

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(422).json({ success: false, message: 'Se requiere un array de IDs.' })
    }

    // Obtener solo los análisis que pertenecen al usuario
    const analyses = await prisma.analysis.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, imageUrl: true, imageProvider: true },
    })

    if (analyses.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontraron análisis.' })
    }

    // Eliminar imágenes del storage (en paralelo, fallos no bloquean)
    await Promise.allSettled(
      analyses.map(a => {
        const publicId = extractPublicId(a.imageUrl, a.imageProvider)
        return storage.delete(publicId)
      })
    )

    // Eliminar de la DB
    const deleted = await prisma.analysis.deleteMany({
      where: { id: { in: analyses.map(a => a.id) }, userId },
    })

    return res.status(200).json({
      success: true,
      message: `${deleted.count} análisis eliminados.`,
      count: deleted.count,
    })
  } catch (error) {
    console.error('[analysisController.deleteMany]', error)
    return res.status(500).json({ success: false, message: 'Error al eliminar los análisis.' })
  }
}

// ── HELPER INTERNO ────────────────────────────────────────────────────────────
/**
 * Extrae el publicId de una URL según el provider.
 * Cloudinary: la URL tiene el publicId embebido.
 * Local: es la ruta relativa.
 */
function extractPublicId(imageUrl, provider) {
  if (provider === 'cloudinary') {
    // Cloudinary URL format: .../upload/v123456/folder/public_id.ext
    const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/)
    return match ? match[1] : null
  }
  if (provider === 'local') {
    // Local URL format: http://localhost:3001/uploads/subfolder/filename
    const match = imageUrl.match(/\/uploads\/(.+)$/)
    return match ? match[1] : null
  }
  return null
}

module.exports = { create, list, deleteOne, deleteMany }
