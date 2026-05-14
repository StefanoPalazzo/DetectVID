// src/controllers/fincaController.js
// ─────────────────────────────────────────────────────────────────────────────
// Controlador para fincas (zonas del viñedo definidas por el usuario en el mapa).
// Cada finca es un polígono GeoJSON asociado a un usuario.
// SIEMPRE filtra por req.user.id.
// ─────────────────────────────────────────────────────────────────────────────

const { validationResult } = require('express-validator')
const prisma               = require('../lib/prisma')

// ── LISTAR FINCAS ─────────────────────────────────────────────────────────────
async function list(req, res) {
  try {
    const fincas = await prisma.finca.findMany({
      where:   { userId: req.user.id },
      orderBy: { created_at: 'asc' },
    })
    return res.status(200).json({ success: true, fincas })
  } catch (error) {
    console.error('[fincaController.list]', error)
    return res.status(500).json({ success: false, message: 'Error al obtener las fincas.' })
  }
}

// ── CREAR FINCA ───────────────────────────────────────────────────────────────
async function create(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    })
  }

  try {
    const { name, color, coordinates } = req.body

    const finca = await prisma.finca.create({
      data: {
        userId: req.user.id,
        name,
        color:       color || '#16a34a',
        coordinates, // array de { lat, lng }
      },
    })

    return res.status(201).json({ success: true, finca })
  } catch (error) {
    console.error('[fincaController.create]', error)
    return res.status(500).json({ success: false, message: 'Error al crear la finca.' })
  }
}

// ── ACTUALIZAR FINCA ──────────────────────────────────────────────────────────
async function update(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    })
  }

  try {
    const { id } = req.params

    // Verificar ownership
    const existing = await prisma.finca.findFirst({ where: { id, userId: req.user.id } })
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Finca no encontrada.' })
    }

    const { name, color, coordinates } = req.body
    const finca = await prisma.finca.update({
      where: { id },
      data:  {
        ...(name        !== undefined && { name }),
        ...(color       !== undefined && { color }),
        ...(coordinates !== undefined && { coordinates }),
      },
    })

    return res.status(200).json({ success: true, finca })
  } catch (error) {
    console.error('[fincaController.update]', error)
    return res.status(500).json({ success: false, message: 'Error al actualizar la finca.' })
  }
}

// ── ELIMINAR FINCA ────────────────────────────────────────────────────────────
async function deleteOne(req, res) {
  try {
    const { id } = req.params

    const finca = await prisma.finca.findFirst({ where: { id, userId: req.user.id } })
    if (!finca) {
      return res.status(404).json({ success: false, message: 'Finca no encontrada.' })
    }

    await prisma.finca.delete({ where: { id } })
    return res.status(200).json({ success: true, message: 'Finca eliminada.' })
  } catch (error) {
    console.error('[fincaController.deleteOne]', error)
    return res.status(500).json({ success: false, message: 'Error al eliminar la finca.' })
  }
}

module.exports = { list, create, update, deleteOne }
