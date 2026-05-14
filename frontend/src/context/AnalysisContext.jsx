// src/context/AnalysisContext.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Context API de React para manejar el estado global del análisis de hojas.
//
// ¿Qué es Context API?
// Es una forma de compartir datos entre componentes sin pasarlos manualmente
// por props en cada nivel. Ideal para estado "global" liviano.
//
// Flujo de estado:
//   idle → (sube imagen) → idle con imagen → (presiona analizar)
//   → analyzing → (IA procesa) → complete | error
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useReducer } from 'react'

// ── 1. ESTADO INICIAL ─────────────────────────────────────────────────────
// Este objeto define la "forma" del estado. Cada campo tiene un propósito claro.
const initialState = {
  // El archivo de imagen seleccionado (objeto File del browser)
  currentImage: null,

  // URL temporal para mostrar la preview de la imagen (base64 o objectURL)
  imagePreview: null,

  // Estado del proceso de análisis
  // 'idle'      → sin imagen o imagen cargada sin analizar
  // 'analyzing' → el mock/modelo está procesando
  // 'complete'  → análisis terminado con éxito
  // 'error'     → algo falló
  analysisStatus: 'idle',

  // El resultado completo devuelto por analyzeLeafImage()
  analysisResult: null,

  // Historial de análisis anteriores (para la página Historial en v2.0)
  analysisHistory: [],

  // Mensaje de error si algo falla
  error: null,
}

// ── 2. REDUCER ────────────────────────────────────────────────────────────
// Un reducer es una función pura: (estadoActual, acción) → nuevoEstado
// Centraliza todas las actualizaciones de estado en un solo lugar.
// Esto hace el código predecible y fácil de debuggear.
function analysisReducer(state, action) {
  switch (action.type) {

    // El usuario seleccionó una imagen válida
    case 'SET_IMAGE':
      return {
        ...state,                        // mantiene el resto del estado
        currentImage:    action.file,    // el objeto File
        imagePreview:    action.preview, // URL para mostrar la imagen
        analysisStatus:  'idle',         // resetea el estado
        analysisResult:  null,           // limpia resultado anterior
        error:           null,           // limpia errores anteriores
      }

    // El usuario presionó "Analizar con IA"
    case 'START_ANALYSIS':
      return {
        ...state,
        analysisStatus: 'analyzing',
        analysisResult: null,
        error:          null,
      }

    // El análisis terminó correctamente
    case 'SET_RESULT':
      return {
        ...state,
        analysisStatus:  'complete',
        analysisResult:  action.result,
        // Agrega al historial para la futura página Historial
        analysisHistory: [action.result, ...state.analysisHistory],
      }

    // Ocurrió un error durante el análisis
    case 'SET_ERROR':
      return {
        ...state,
        analysisStatus: 'error',
        error:          action.error,
      }

    // El usuario quiere empezar de nuevo (botón "Nueva imagen")
    case 'RESET':
      return {
        ...initialState,
        // Preservamos el historial aunque resetemos el análisis actual
        analysisHistory: state.analysisHistory,
      }

    // Si llega una acción desconocida, devolvemos el estado sin cambios
    default:
      return state
  }
}

// ── 3. CONTEXTO ───────────────────────────────────────────────────────────
// createContext() crea el "canal" por el cual los componentes van a
// acceder al estado y las acciones. El valor por defecto es null
// (lo detectamos en useAnalysis para dar un error claro).
const AnalysisContext = createContext(null)

// ── 4. PROVIDER ───────────────────────────────────────────────────────────
// El Provider "envuelve" los componentes que necesitan acceder al estado.
// Solo los componentes dentro de <AnalysisProvider> pueden usar useAnalysis().
export function AnalysisProvider({ children }) {
  // useReducer es como useState pero para estados más complejos
  // dispatch es la función que enviamos acciones al reducer
  const [state, dispatch] = useReducer(analysisReducer, initialState)

  // ── Acciones ──────────────────────────────────────────────────────────
  // Funciones helper que despachan acciones con la forma correcta.
  // Los componentes llaman estas funciones en lugar de dispatch directamente.

  // Guarda la imagen seleccionada en el estado global
  const setImage = (file, preview) => {
    dispatch({ type: 'SET_IMAGE', file, preview })
  }

  // Marca el inicio del procesamiento de IA
  const startAnalysis = () => {
    dispatch({ type: 'START_ANALYSIS' })
  }

  // Guarda el resultado del análisis
  const setResult = (result) => {
    dispatch({ type: 'SET_RESULT', result })
  }

  // Guarda un mensaje de error
  const setError = (error) => {
    dispatch({ type: 'SET_ERROR', error })
  }

  // Resetea a estado inicial (preservando historial)
  const resetAnalysis = () => {
    dispatch({ type: 'RESET' })
  }

  // Valor que compartimos con todos los componentes hijos
  const value = {
    // Estado (solo lectura)
    ...state,
    // Acciones (funciones para modificar el estado)
    setImage,
    startAnalysis,
    setResult,
    setError,
    resetAnalysis,
  }

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  )
}

// ── 5. CUSTOM HOOK ────────────────────────────────────────────────────────
// useAnalysis() es el hook que los componentes usan para acceder al contexto.
// El chequeo de null da un error útil si alguien usa el hook fuera del Provider.
export function useAnalysis() {
  const context = useContext(AnalysisContext)

  if (!context) {
    throw new Error(
      'useAnalysis() debe usarse dentro de <AnalysisProvider>. ' +
      'Asegurate de que el componente esté envuelto en el Provider en App.jsx.'
    )
  }

  return context
}

export default AnalysisContext
