// src/services/authService.js
// ─────────────────────────────────────────────────────────────────────────────
// Capa de servicio para comunicarse con el backend de autenticación.
//
// ¿Por qué una capa de servicio separada?
// Centraliza todas las llamadas HTTP en un lugar. Si la URL del backend cambia,
// solo hay que tocar este archivo — no buscar fetch() por toda la app.
//
// Todas las funciones usan credentials: 'include' para que el browser
// envíe y reciba las cookies HttpOnly automáticamente.
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

/**
 * Helper interno: hace fetch al backend y parsea la respuesta JSON.
 * Lanza error si el servidor responde con status de error (4xx, 5xx).
 */
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // CRÍTICO: enviar/recibir cookies cross-origin
    ...options,
  })

  const data = await res.json()

  if (!res.ok) {
    // Lanzar el mensaje de error del backend para mostrarlo en la UI
    throw new Error(data.message || 'Error en la solicitud.')
  }

  return data
}

// ── Registro ──────────────────────────────────────────────────────────────────
/**
 * Crea una cuenta nueva.
 * @param {{ name: string, email: string, password: string }} userData
 * @returns {{ success: boolean, user: object }}
 */
export async function registerUser(userData) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body:   JSON.stringify(userData),
  })
}

// ── Login ─────────────────────────────────────────────────────────────────────
/**
 * Inicia sesión. El backend setea la cookie HttpOnly automáticamente.
 * @param {{ email: string, password: string }} credentials
 * @returns {{ success: boolean, user: object }}
 */
export async function loginUser(credentials) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body:   JSON.stringify(credentials),
  })
}

// ── Logout ────────────────────────────────────────────────────────────────────
/**
 * Cierra sesión. El backend limpia la cookie.
 */
export async function logoutUser() {
  return apiFetch('/auth/logout', { method: 'POST' })
}

// ── Obtener usuario actual ────────────────────────────────────────────────────
/**
 * Devuelve los datos del usuario autenticado leyendo la cookie actual.
 * Usado al iniciar la app para restaurar la sesión si existe.
 * @returns {{ success: boolean, user: object }}
 */
export async function getCurrentUser() {
  return apiFetch('/auth/me')
}
