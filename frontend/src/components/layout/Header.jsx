// src/components/layout/Header.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Barra superior con soporte de dark/light mode.
// Incluye el botón de toggle de tema.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import { useLocation } from 'react-router-dom'
import { UserCircle2, Sun, Moon } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

const PAGE_MAP = {
  '/':          { title: 'Inicio',           subtitle: 'Panel principal de DetectVID' },
  '/analyze':   { title: 'Analizar Hoja',    subtitle: 'Detección de enfermedades mediante IA' },
  '/history':   { title: 'Historial',        subtitle: 'Registro de análisis anteriores' },
  '/dashboard': { title: 'Dashboard',        subtitle: 'Estadísticas generales de la finca' },
  '/map':       { title: 'Mapa de Finca',    subtitle: 'Geolocalización y monitoreo GPS' },
  '/settings':  { title: 'Configuración',    subtitle: 'Preferencias del sistema' },
}

export default function Header() {
  const location   = useLocation()
  const { isDark, toggleTheme } = useTheme()

  const page = PAGE_MAP[location.pathname] || { title: 'DetectVID', subtitle: '' }

  return (
    // bg-white/dark:bg-gray-900 — blanco en light, gris oscuro en dark
    <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between flex-shrink-0">

      {/* ── TÍTULO DE SECCIÓN ──────────────────────────────────────── */}
      <div>
        <h2 className="text-gray-900 dark:text-white font-semibold text-lg leading-none">
          {page.title}
        </h2>
        {page.subtitle && (
          <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">{page.subtitle}</p>
        )}
      </div>

      {/* ── ÁREA DERECHA ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3">

        {/* Badge de estado */}
        <div className="flex items-center gap-1.5 bg-emerald-700/20 border border-emerald-700/40 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Sistema Activo</span>
        </div>

        {/* ── BOTÓN TOGGLE TEMA ───────────────────────────────────── */}
        {/*
          Cuando isDark=true  → mostramos Sol (click cambia a claro)
          Cuando isDark=false → mostramos Luna (click cambia a oscuro)
          La transición suave es gracias a transition-all duration-200
        */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="p-2 rounded-lg transition-all duration-200
            bg-gray-100 hover:bg-gray-200 text-gray-600
            dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300"
          aria-label="Toggle tema claro/oscuro"
        >
          {/* Animamos el ícono con una pequeña rotación al cambiar */}
          <span className="block transition-transform duration-300">
            {isDark
              ? <Sun  size={17} />   // En modo oscuro: mostrar sol para ir a claro
              : <Moon size={17} />   // En modo claro: mostrar luna para ir a oscuro
            }
          </span>
        </button>

        {/* Divisor vertical */}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />

        {/* Info del usuario */}
        <div className="flex items-center gap-2">
          <UserCircle2 size={20} className="text-gray-400 dark:text-gray-400" />
          <span className="text-gray-700 dark:text-gray-300 text-sm font-medium">Demo</span>
        </div>
      </div>
    </header>
  )
}
