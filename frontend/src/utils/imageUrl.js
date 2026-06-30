// src/utils/imageUrl.js
// Normaliza URLs de imágenes guardadas por el backend para que funcionen
// tanto con Docker/Nginx como con registros antiguos que apuntaban a localhost.

export function normalizeImageUrl(url) {
  if (!url) return ''
  const raw = String(url).trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw)
    if (parsed.pathname.startsWith('/uploads/')) {
      return parsed.pathname
    }
    return raw
  } catch {
    // Not an absolute URL. Keep /uploads/... relative to the same origin.
  }

  if (raw.startsWith('/')) return raw
  return `/${raw}`
}
