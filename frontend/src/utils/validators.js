// src/utils/validators.js
// ─────────────────────────────────────────────────────────────────────────────
// Funciones de validación para las imágenes subidas en DetectVID.
//
// "Validar" significa verificar que la entrada del usuario cumple con
// los requisitos antes de procesarla. Esto evita errores en el análisis
// y da feedback claro al usuario sobre qué salió mal.
// ─────────────────────────────────────────────────────────────────────────────

// ── CONSTANTES ────────────────────────────────────────────────────────────
// Definimos las reglas de validación como constantes para que sean
// fáciles de cambiar en un solo lugar.

/** Formatos de imagen aceptados (MIME types) */
const ACCEPTED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/** Tamaño máximo de archivo: 10 MB en bytes */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  // 10 MB

/** Dimensiones mínimas de imagen para que el modelo pueda analizarla */
const MIN_WIDTH  = 100
const MIN_HEIGHT = 100

/** Dimensiones recomendadas para mejor precisión */
const RECOMMENDED_MIN_WIDTH  = 224
const RECOMMENDED_MIN_HEIGHT = 224

// ── VALIDACIONES ──────────────────────────────────────────────────────────

/**
 * validateImageFile — Valida el archivo de imagen antes de procesarlo
 *
 * Verifica: existencia, tipo de archivo, y tamaño.
 *
 * @param {File} file — El archivo seleccionado por el usuario
 * @returns {{ valid: boolean, error?: string }} — Resultado de la validación
 *
 * Ejemplo de uso:
 *   const result = validateImageFile(file)
 *   if (!result.valid) {
 *     console.error(result.error) // "El archivo supera el tamaño máximo de 10 MB"
 *   }
 */
export function validateImageFile(file) {
  // Verificar que existe el archivo
  if (!file) {
    return { valid: false, error: 'No se seleccionó ningún archivo.' }
  }

  // Verificar que es un objeto File válido
  if (!(file instanceof File)) {
    return { valid: false, error: 'El archivo no es válido.' }
  }

  // Verificar el tipo/formato del archivo
  // file.type devuelve el MIME type: "image/jpeg", "image/png", etc.
  if (!ACCEPTED_FORMATS.includes(file.type)) {
    const accepted = 'JPG, JPEG, PNG, WEBP'
    return {
      valid: false,
      error: `Formato no soportado: "${file.type || 'desconocido'}". ` +
             `Solo se aceptan: ${accepted}.`,
    }
  }

  // Verificar el tamaño del archivo
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = formatFileSize(file.size)
    return {
      valid: false,
      error: `El archivo pesa ${sizeMB}, que supera el máximo de 10 MB. ` +
             `Intentá comprimirlo o usar una imagen de menor resolución.`,
    }
  }

  // Si pasó todas las validaciones, es válido
  return { valid: true }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateImageQuality — Valida la calidad mínima de la imagen
 *
 * Verifica que la imagen tenga dimensiones suficientes para el análisis.
 * Esta función recibe un elemento <img> ya cargado en el DOM.
 *
 * @param {HTMLImageElement} imageElement — Elemento img con la imagen cargada
 * @returns {{ valid: boolean, quality: string, warning?: string }}
 *   quality: "good" | "low" | "minimum"
 */
export function validateImageQuality(imageElement) {
  if (!imageElement) {
    return { valid: false, quality: 'unknown', warning: 'No se pudo cargar la imagen.' }
  }

  const { naturalWidth: width, naturalHeight: height } = imageElement

  // Imagen demasiado pequeña — no se puede analizar
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return {
      valid: false,
      quality: 'too-small',
      warning: `La imagen es muy pequeña (${width}×${height}px). ` +
               `Se requiere mínimo ${MIN_WIDTH}×${MIN_HEIGHT}px.`,
    }
  }

  // Imagen con dimensiones mínimas — funciona pero con menor precisión
  if (width < RECOMMENDED_MIN_WIDTH || height < RECOMMENDED_MIN_HEIGHT) {
    return {
      valid: true,
      quality: 'low',
      warning: `La imagen tiene dimensiones bajas (${width}×${height}px). ` +
               `Para mejor precisión se recomiendan ${RECOMMENDED_MIN_WIDTH}×${RECOMMENDED_MIN_HEIGHT}px o más.`,
    }
  }

  // Imagen con buena calidad
  return { valid: true, quality: 'good' }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * formatFileSize — Convierte bytes a un string legible por humanos
 *
 * @param {number} bytes — Tamaño en bytes
 * @returns {string} — Ejemplo: "1.2 MB", "450 KB", "23 B"
 */
export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '—'
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  // Math.log determina qué unidad usar según la magnitud
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)

  // Mostramos hasta 1 decimal para KB y MB
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * getImageDimensions — Obtiene las dimensiones de una imagen de forma asíncrona
 *
 * Crea un elemento <img> temporal, espera a que cargue, y lee naturalWidth/Height.
 *
 * @param {File} file — El archivo de imagen
 * @returns {Promise<{ width: number, height: number }>}
 */
export function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    // Crear URL temporal para el archivo (vive en memoria, no en el servidor)
    const url = URL.createObjectURL(file)

    const img = new Image()

    img.onload = () => {
      // Liberamos la URL de memoria después de usarla (buena práctica)
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudieron obtener las dimensiones de la imagen.'))
    }

    // Disparar la carga asignando el src
    img.src = url
  })
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateAnalysisId — Genera un ID único para cada análisis
 *
 * Formato: DVD-YYYYMMDD-XXXX (ej: DVD-20250429-A7F2)
 *
 * @returns {string}
 */
export function generateAnalysisId() {
  const now  = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const suffix = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return `DVD-${date}-${suffix}`
}

/**
 * getFormatLabel — Devuelve una etiqueta legible del formato
 *
 * @param {string} mimeType — Ej: "image/jpeg"
 * @returns {string} — Ej: "JPEG"
 */
export function getFormatLabel(mimeType) {
  const map = {
    'image/jpeg': 'JPEG',
    'image/jpg':  'JPG',
    'image/png':  'PNG',
    'image/webp': 'WEBP',
  }
  return map[mimeType] || mimeType?.split('/')[1]?.toUpperCase() || 'Desconocido'
}
