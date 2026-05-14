// src/App.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Componente raíz de DetectVID.
// Configura el router, los contextos globales y las rutas protegidas.
//
// Orden de providers (de afuera hacia adentro):
//   ThemeProvider     — aplica clase "dark" en <html>
//   BrowserRouter     — habilita navegación con React Router
//   AuthProvider      — gestiona sesión del usuario (JWT via cookie)
//   AnalysisProvider  — estado del análisis de hojas
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import MainLayout from './components/layout/MainLayout'
import { AnalysisProvider } from './context/AnalysisContext'
import { ThemeProvider }    from './context/ThemeContext'
import { AuthProvider }     from './context/AuthContext'
import ProtectedRoute       from './components/ProtectedRoute'

import Home        from './pages/Home'
import Analyze     from './pages/Analyze'
import History     from './pages/History'
import Dashboard   from './pages/Dashboard'
import VineyardMap from './pages/VineyardMap'
import SettingsPage from './pages/Settings'
import Login       from './pages/Login'
import Register    from './pages/Register'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        {/* AuthProvider debe estar dentro de BrowserRouter para usar useNavigate internamente */}
        <AuthProvider>
          <AnalysisProvider>
            <Routes>

              {/* ── Rutas públicas (sin sidebar, sin auth requerida) ── */}
              <Route path="/login"    element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* ── Rutas protegidas (requieren sesión activa) ──────── */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route index            element={<Home />} />
                <Route path="analyze"   element={<Analyze />} />
                <Route path="history"   element={<History />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="map"       element={<VineyardMap />} />
                <Route path="settings"  element={<SettingsPage />} />
                <Route path="*"         element={<Home />} />
              </Route>

            </Routes>
          </AnalysisProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
