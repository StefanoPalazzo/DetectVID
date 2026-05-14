// src/storage/providers/local.js
// ─────────────────────────────────────────────────────────────────────────────
// Provider de almacenamiento local en disco.
// Guarda las imágenes en backend/uploads/ y las sirve como archivos estáticos.
// Ideal para desarrollo sin conexión o para el servidor de la facultad.
//
// Para usar este provider en .env:
//   STORAGE_PROVIDER=local
//   LOCAL_STORAGE_PATH=./uploads           (relativo al directorio backend/)
//   LOCAL_STORAGE_URL=http://localhost:3001 (base URL del servidor)
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs')
const path = require('path')

const UPLOADS_DIR = process.env.LOCAL_STORAGE_PATH
  ? path.resolve(process.cwd(), process.env.LOCAL_STORAGE_PATH)
  : path.join(__dirname, '../../../uploads')

// Crear el directorio si no existe al importar el módulo
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

/**
 * Guarda una imagen en disco local.
 * @param {Buffer} buffer
 * @param {Object} options — { filename }
 * @returns {Promise<{ url: string, publicId: string, provider: string }>}
 */
async function upload(buffer, options = {}) {
  const filename  = options.filename || `${Date.now()}-upload.jpg`
  const subfolder = options.folder   || 'analyses'
  const dir       = path.join(UPLOADS_DIR, subfolder)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const filepath = path.join(dir, filename)
  await fs.promises.writeFile(filepath, buffer)

  const baseUrl  = process.env.LOCAL_STORAGE_URL || 'http://localhost:3001'
  const url      = `${baseUrl}/uploads/${subfolder}/${filename}`
  const publicId = `${subfolder}/${filename}`

  return { url, publicId, provider: 'local' }
}

/**
 * Elimina un archivo del disco.
 * @param {string} publicId — Ruta relativa dentro de uploads/
 */
async function deleteFile(publicId) {
  if (!publicId) return
  const filepath = path.join(UPLOADS_DIR, publicId)
  if (fs.existsSync(filepath)) {
    await fs.promises.unlink(filepath)
  }
}

function getUrl(publicId) {
  const baseUrl = process.env.LOCAL_STORAGE_URL || 'http://localhost:3001'
  return `${baseUrl}/uploads/${publicId}`
}

module.exports = { upload, delete: deleteFile, getUrl, provider: 'local' }
