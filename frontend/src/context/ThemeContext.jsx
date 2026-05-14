// src/context/ThemeContext.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Contexto de tema (claro / oscuro) para DetectVID.
//
// ¿Cómo funciona el dark mode en Tailwind?
// Con la opción darkMode: 'class' en tailwind.config.js, Tailwind activa
// las clases "dark:" cuando el elemento <html> tiene la clase "dark".
// Este contexto es el responsable de agregar/quitar esa clase.
//
// Ejemplo:
//   <html class="dark">   ← modo oscuro activo, dark:bg-gray-950 aplica
//   <html>                ← modo claro, bg-white aplica
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, useEffect } from 'react'

// Clave del localStorage donde guardamos la preferencia del usuario
// localStorage persiste entre sesiones (a diferencia de sessionStorage)
const STORAGE_KEY = 'detectvid-theme'

// Creamos el contexto con valor null (lo detectamos en useTheme para dar error útil)
const ThemeContext = createContext(null)

// ── PROVIDER ──────────────────────────────────────────────────────────────
export function ThemeProvider({ children }) {
  // Inicializamos el estado leyendo localStorage
  // Si el usuario ya eligió un tema antes, lo recuperamos; si no, 'dark' por defecto
  const [theme, setTheme] = useState(() => {
    // localStorage puede no existir en SSR (aunque Vite es SPA, buena práctica)
    try {
      return localStorage.getItem(STORAGE_KEY) || 'dark'
    } catch {
      return 'dark'
    }
  })

  // Cada vez que theme cambia:
  // 1. Aplicamos/quitamos la clase "dark" en <html>
  // 2. Guardamos la preferencia en localStorage
  useEffect(() => {
    const root = document.documentElement // → el elemento <html>

    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // Persistir preferencia
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // localStorage puede estar bloqueado en modo privado extremo — ignoramos
    }
  }, [theme]) // ← solo se re-ejecuta cuando theme cambia

  // Función para alternar entre claro y oscuro
  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  // isDark es un booleano conveniente para los componentes que necesiten
  // saber el tema actual sin comparar strings
  const isDark = theme === 'dark'

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ── HOOK ──────────────────────────────────────────────────────────────────
// useTheme() es la forma en que los componentes acceden al contexto.
// Si alguien lo usa fuera del Provider, tira un error claro.
export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error(
      'useTheme() debe usarse dentro de <ThemeProvider>. ' +
      'Verificá que App.jsx envuelva todo con <ThemeProvider>.'
    )
  }

  return context
}

export default ThemeContext
