// src/storage/providers/cloudinary.js
// ─────────────────────────────────────────────────────────────────────────────
// Provider de Cloudinary para almacenamiento de imágenes.
// Variables de entorno necesarias en .env:
//   CLOUDINARY_CLOUD_NAME=tu_cloud_name
//   CLOUDINARY_API_KEY=tu_api_key
//   CLOUDINARY_API_SECRET=tu_api_secret
// ─────────────────────────────────────────────────────────────────────────────

const cloudinary = require('cloudinary').v2
const streamifier = require('streamifier')

// Configurar con variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * Sube una imagen a Cloudinary.
 * @param {Buffer} buffer — Contenido del archivo en memoria
 * @param {Object} options — { folder, filename }
 * @returns {Promise<{ url: string, publicId: string, provider: string }>}
 */
async function upload(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const folder = options.folder || 'detectvid/analyses'

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: options.filename,
        resource_type: 'image',
        // Transformación automática: optimiza para web
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) return reject(new Error(`Cloudinary upload failed: ${error.message}`))
        resolve({
          url:      result.secure_url,
          publicId: result.public_id,
          provider: 'cloudinary',
        })
      }
    )

    // Convertir Buffer a stream para la API de Cloudinary
    streamifier.createReadStream(buffer).pipe(uploadStream)
  })
}

/**
 * Elimina una imagen de Cloudinary.
 * @param {string} publicId — El public_id devuelto al subir
 */
async function deleteFile(publicId) {
  if (!publicId) return
  await cloudinary.uploader.destroy(publicId)
}

/**
 * Devuelve la URL pública de un recurso (ya incluida en upload, pero útil para regenerar)
 * @param {string} publicId
 * @param {Object} options — transformaciones opcionales
 */
function getUrl(publicId, options = {}) {
  return cloudinary.url(publicId, { secure: true, ...options })
}

module.exports = { upload, delete: deleteFile, getUrl, provider: 'cloudinary' }
