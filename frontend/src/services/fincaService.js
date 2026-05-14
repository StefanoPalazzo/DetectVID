// src/services/fincaService.js
// ─────────────────────────────────────────────────────────────────────────────
// Servicio para operaciones CRUD de fincas (parcelas del viñedo).
// Todas las llamadas requieren autenticación (cookie HttpOnly).
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// ── Helper genérico de fetch ──────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Error en la solicitud.')
  return data
}

// ── Fincas ────────────────────────────────────────────────────────────────────

/** Obtiene todas las fincas del usuario autenticado */
export const getFincas = () => apiFetch('/fincas')

/** Crea una nueva finca con nombre, color y coordenadas del polígono */
export const createFinca = (data) =>
  apiFetch('/fincas', { method: 'POST', body: JSON.stringify(data) })

/** Actualiza nombre, color o coordenadas de una finca existente */
export const updateFinca = (id, data) =>
  apiFetch(`/fincas/${id}`, { method: 'PUT', body: JSON.stringify(data) })

/** Elimina una finca por su ID */
export const deleteFinca = (id) =>
  apiFetch(`/fincas/${id}`, { method: 'DELETE' })
