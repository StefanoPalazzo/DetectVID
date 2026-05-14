// src/context/AuthContext.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Contexto global de autenticación.
// Provee el usuario actual, estado de carga, y funciones de auth a toda la app.
//
// Patrón: al montar la app, intentamos restaurar la sesión llamando a /auth/me.
// Si la cookie HttpOnly es válida, el backend devuelve el usuario y lo seteamos.
// Si no, simplemente quedamos en estado "no autenticado".
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loginUser, registerUser, logoutUser, getCurrentUser } from '../services/authService'

// ── Contexto ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)    // Usuario autenticado o null
  const [loading, setLoading] = useState(true)    // true mientras restauramos sesión al inicio
  const [error, setError]     = useState(null)    // Mensaje de error de la última operación

  // ── Restaurar sesión al iniciar la app ──────────────────────────────────────
  // Se ejecuta UNA sola vez cuando el componente monta.
  // Consulta al backend si hay una cookie válida para recuperar el usuario.
  useEffect(() => {
    async function restoreSession() {
      try {
        const { user } = await getCurrentUser()
        setUser(user)
      } catch {
        // No hay sesión activa — es el estado normal para un usuario nuevo
        setUser(null)
      } finally {
        setLoading(false) // En cualquier caso, ya terminamos de verificar
      }
    }
    restoreSession()
  }, [])

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = useCallback(async (credentials) => {
    setError(null)
    try {
      const { user } = await loginUser(credentials)
      setUser(user)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  // ── Registro ─────────────────────────────────────────────────────────────────
  const register = useCallback(async (userData) => {
    setError(null)
    try {
      const { user } = await registerUser(userData)
      setUser(user)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  // ── Logout ───────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await logoutUser()
    } catch {
      // Si falla el request, igual limpiamos el estado local
    } finally {
      setUser(null)
    }
  }, [])

  const value = {
    user,       // { id, name, email, role } | null
    loading,    // true mientras se verifica la sesión inicial
    error,      // string | null — último error de auth
    isAuth: !!user,             // booleano de conveniencia
    isAdmin: user?.role === 'ADMIN',
    login,
    register,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook de consumo ───────────────────────────────────────────────────────────
/**
 * Hook para consumir el contexto de auth en cualquier componente.
 * Uso: const { user, login, logout, isAuth } = useAuth()
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return ctx
}
