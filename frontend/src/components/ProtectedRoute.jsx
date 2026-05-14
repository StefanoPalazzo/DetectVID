// src/components/ProtectedRoute.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Componente que protege rutas que requieren autenticación.
//
// Flujo:
// 1. Si aún estamos verificando la sesión (loading) → mostrar spinner
// 2. Si hay usuario autenticado → renderizar la ruta normalmente
// 3. Si no hay usuario → redirigir a /login (guardando la ruta original)
//
// El parámetro "state" en el Navigate guarda la ruta que el usuario quería
// visitar, para redirigirlo ahí después del login.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Leaf } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requiredRole }) {
  const { isAuth, user, loading } = useAuth()
  const location = useLocation()

  // Mientras verificamos la sesión inicial, mostrar spinner
  // (evita un flash de /login antes de saber si hay sesión)
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl gradient-vine flex items-center justify-center shadow-glow animate-pulse">
            <Leaf size={22} className="text-white" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Verificando sesión…</p>
        </div>
      </div>
    )
  }

  // No autenticado → redirigir a login
  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Verificación de rol (si se requiere uno específico)
  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />
  }

  return children
}
