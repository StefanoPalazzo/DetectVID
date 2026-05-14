// src/services/analysisService.js
// ─────────────────────────────────────────────────────────────────────────────
// Servicio para las llamadas a la API de análisis.
// Centraliza todos los fetch relacionados con /api/analyses.
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// ── Helper interno ────────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    credentials: 'include',
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Error en la solicitud.')
  return data
}

// ── Guardar un análisis nuevo ─────────────────────────────────────────────────
export async function saveAnalysis(imageFile, result, coords = null) {
  const formData = new FormData()
  formData.append('image', imageFile)
  formData.append('result', JSON.stringify(result))
  if (coords?.latitude  != null) formData.append('latitude',  coords.latitude)
  if (coords?.longitude != null) formData.append('longitude', coords.longitude)
  return apiFetch('/analyses', { method: 'POST', body: formData })
}

// ── Obtener todos los análisis del usuario autenticado ────────────────────────
export async function getAnalyses(params = {}) {
  const query = new URLSearchParams(params).toString()
  return apiFetch(`/analyses${query ? '?' + query : ''}`)
}

// ── Eliminar un análisis por ID ───────────────────────────────────────────────
export async function deleteAnalysis(id) {
  return apiFetch(`/analyses/${id}`, { method: 'DELETE' })
}

// ── Eliminar múltiples análisis por array de IDs ──────────────────────────────
export async function deleteAnalyses(ids) {
  return apiFetch('/analyses', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}
