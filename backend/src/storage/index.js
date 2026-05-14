// src/storage/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Capa de abstracción de storage — patrón Adapter/Strategy.
//
// ¿Por qué esto?
// Si mañana querés cambiar de Cloudinary a AWS S3, Google Cloud Storage,
// o el servidor propio de la facultad, solo cambiás STORAGE_PROVIDER en .env
// y creás (o ya existe) el adapter correspondiente.
// El resto del código (controllers, routes) no se toca.
//
// Implementar un nuevo provider:
//   1. Crear src/storage/providers/tuProvider.js
//   2. Exportar { upload, delete: deleteFile, getUrl } con la misma firma
//   3. Agregar el case en este archivo
// ─────────────────────────────────────────────────────────────────────────────

const cloudinaryProvider = require('./providers/cloudinary')
const localProvider      = require('./providers/local')

/**
 * Devuelve el provider de storage activo según STORAGE_PROVIDER en .env
 * Default: 'local' (cero configuración, ideal para desarrollo)
 */
function getStorageProvider() {
  const provider = process.env.STORAGE_PROVIDER || 'local'

  switch (provider) {
    case 'cloudinary': return cloudinaryProvider
    case 'local':      return localProvider
    // Agregar futuros providers acá:
    // case 's3':      return require('./providers/s3')
    // case 'gcs':     return require('./providers/gcs')
    // case 'custom':  return require('./providers/custom')
    default:
      console.warn(`[Storage] Provider desconocido: "${provider}". Usando "local".`)
      return localProvider
  }
}

// Exportamos directamente las funciones del provider activo.
// Los controllers llaman storage.upload(), storage.delete() sin saber qué provider es.
const storage = getStorageProvider()
module.exports = storage
