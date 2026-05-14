// src/pages/Analyze.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Página principal del MVP: flujo completo de análisis de una hoja de vid.
//
// Flujo de estados:
//   1. idle (sin imagen)  → muestra UploadZone
//   2. idle (con imagen)  → muestra ImagePreview + campo de coordenadas + botón "Analizar"
//   3. analyzing          → muestra AnalysisLoader
//   4. complete           → muestra ResultsCard
//   5. error              → muestra mensaje de error + opción de retry
//
// Lógica de GPS (en orden de prioridad):
//   1. EXIF de la foto (si existe) — más preciso, ya está en la imagen
//   2. GPS del dispositivo — se pide en paralelo si no hay EXIF
//   3. Manual — el usuario puede editar/limpiar las coordenadas en la UI
// ─────────────────────────────────────────────────────────────────────────────

import React, { useRef, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ScanLine, Brain, AlertCircle, RefreshCw, MapPin, X, Loader2 } from 'lucide-react'
import * as exifr from 'exifr'
import { useAnalysis } from '../context/AnalysisContext'
import { analyzeLeafImage } from '../services/mlService'
import { saveAnalysis } from '../services/analysisService'
import UploadZone     from '../components/analysis/UploadZone'
import ImagePreview   from '../components/analysis/ImagePreview'
import AnalysisLoader from '../components/analysis/AnalysisLoader'
import ResultsCard    from '../components/analysis/ResultsCard'

// ── HELPER: GPS del dispositivo ───────────────────────────────────────────────
// Timeout de 5s — no bloqueamos el flujo si el GPS tarda o el usuario lo niega.
function requestDeviceGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    const timeout = setTimeout(() => resolve(null), 5000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout)
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      },
      () => { clearTimeout(timeout); resolve(null) },
      { timeout: 5000, maximumAge: 60000 }
    )
  })
}

// ── HELPER: GPS del EXIF de la imagen ────────────────────────────────────────
// exifr.gps() devuelve { latitude, longitude } o null si no hay datos GPS.
// Es asíncrono y muy liviano — solo parsea el bloque GPS del EXIF.
async function readExifGPS(file) {
  try {
    const gps = await exifr.gps(file)
    if (gps?.latitude != null && gps?.longitude != null) {
      return { latitude: gps.latitude, longitude: gps.longitude }
    }
    return null
  } catch {
    return null   // si falla el parseo, no romper el flujo
  }
}

// ── HELPER: formatear coordenadas para mostrar en la UI ───────────────────────
function formatCoords(lat, lng) {
  if (lat == null || lng == null) return ''
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

// ── INDICADOR DE PASOS ────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Subir imagen'  },
  { id: 2, label: 'Verificar'     },
  { id: 3, label: 'Analizar'      },
  { id: 4, label: 'Resultado'     },
]

function getActiveStep(status, hasImage) {
  if (status === 'complete')  return 4
  if (status === 'analyzing') return 3
  if (hasImage)               return 2
  return 1
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function Analyze() {
  const {
    currentImage,
    analysisStatus,
    analysisResult,
    error,
    startAnalysis,
    setResult,
    setError,
    resetAnalysis,
  } = useAnalysis()

  const activeStep = getActiveStep(analysisStatus, !!currentImage)

  // ── Estado de coordenadas GPS ─────────────────────────────────────────────
  // coords: { latitude, longitude } | null
  // coordsSource: 'exif' | 'device' | 'manual' | null
  const [coords,      setCoords]      = useState(null)
  const [coordsSource, setCoordsSource] = useState(null)
  const [coordsInput, setCoordsInput] = useState('')    // valor del input editable
  const [coordsLoading, setCoordsLoading] = useState(false)
  const [editingCoords, setEditingCoords] = useState(false)

  // Cuando cambia la imagen: intentar leer EXIF, luego device GPS como fallback
  useEffect(() => {
    if (!currentImage) {
      // Resetear coordenadas al limpiar la imagen
      setCoords(null)
      setCoordsSource(null)
      setCoordsInput('')
      setEditingCoords(false)
      return
    }

    async function loadCoords() {
      setCoordsLoading(true)

      // 1. Intentar EXIF de la foto
      const exifCoords = await readExifGPS(currentImage)
      if (exifCoords) {
        setCoords(exifCoords)
        setCoordsSource('exif')
        setCoordsInput(formatCoords(exifCoords.latitude, exifCoords.longitude))
        setCoordsLoading(false)
        return
      }

      // 2. Sin EXIF → pedir GPS del dispositivo
      const deviceCoords = await requestDeviceGPS()
      if (deviceCoords) {
        setCoords(deviceCoords)
        setCoordsSource('device')
        setCoordsInput(formatCoords(deviceCoords.latitude, deviceCoords.longitude))
      } else {
        setCoords(null)
        setCoordsSource(null)
        setCoordsInput('')
      }

      setCoordsLoading(false)
    }

    loadCoords()
  }, [currentImage])

  // ── Parsear el input manual de coordenadas ────────────────────────────────
  // Acepta "lat, lng" con punto decimal — ej: "-32.889500, -68.846700"
  function handleCoordsInputChange(e) {
    const val = e.target.value
    setCoordsInput(val)

    const match = val.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/)
    if (match) {
      const lat = parseFloat(match[1])
      const lng = parseFloat(match[2])
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setCoords({ latitude: lat, longitude: lng })
        setCoordsSource('manual')
        return
      }
    }
    // Si el input no es válido (mientras tipea), no limpiar coords — esperar
  }

  function handleClearCoords() {
    setCoords(null)
    setCoordsSource(null)
    setCoordsInput('')
    setEditingCoords(false)
  }

  // ── Manejador del botón "Analizar con IA" ─────────────────────────────────
  const handleAnalyze = async () => {
    if (!currentImage) return

    try {
      startAnalysis()

      // Ejecutar análisis de IA (coords ya las tenemos del useEffect)
      const result = await analyzeLeafImage(currentImage)
      setResult(result)

      // Persistir en la DB de forma no bloqueante
      saveAnalysis(currentImage, result, coords).catch((err) => {
        console.warn('[DetectVID] No se pudo guardar el análisis en la BD:', err.message)
      })

    } catch (err) {
      console.error('[DetectVID] Error en análisis:', err)
      setError(err.message || 'Ocurrió un error inesperado durante el análisis. Intentá de nuevo.')
    }
  }

  // ── Etiqueta de la fuente de coordenadas ─────────────────────────────────
  const coordsSourceLabel = {
    exif:   { text: 'EXIF de la foto', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30' },
    device: { text: 'GPS del dispositivo', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30' },
    manual: { text: 'Coordenadas manuales', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30' },
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

      {/* ── HEADER DE PÁGINA ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg gradient-vine flex items-center justify-center">
            <ScanLine size={16} className="text-white" />
          </div>
          <h1 className="text-gray-900 dark:text-white font-bold text-2xl">Analizar Hoja</h1>
        </div>
        <p className="text-gray-500 text-sm pl-11">
          Subí una fotografía de una hoja de vid para detectar posibles enfermedades mediante inteligencia artificial
        </p>
      </div>

      {/* ── INDICADOR DE PASOS ────────────────────────────────────── */}
      <StepIndicator steps={STEPS} activeStep={activeStep} />

      {/* ── CONTENIDO PRINCIPAL (animado por estado) ──────────────── */}
      <AnimatePresence mode="wait">

        {/* PASO 1: Sin imagen → mostrar zona de upload */}
        {analysisStatus === 'idle' && !currentImage && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UploadZone />
          </motion.div>
        )}

        {/* PASO 2: Imagen cargada, sin análisis → mostrar preview + GPS + botón analizar */}
        {analysisStatus === 'idle' && currentImage && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            <ImagePreview />

            {/* ── SECCIÓN DE COORDENADAS GPS ────────────────────── */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Ubicación del análisis
                  </span>
                </div>

                {/* Badge de fuente */}
                {coordsSource && coordsSourceLabel[coordsSource] && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${coordsSourceLabel[coordsSource].bg} ${coordsSourceLabel[coordsSource].color}`}>
                    {coordsSourceLabel[coordsSource].text}
                  </span>
                )}
              </div>

              {/* Estado: cargando coordenadas */}
              {coordsLoading && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  Detectando ubicación…
                </div>
              )}

              {/* Estado: coordenadas disponibles o edición manual */}
              {!coordsLoading && (
                <div className="space-y-2">
                  {editingCoords ? (
                    // Input editable
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={coordsInput}
                        onChange={handleCoordsInputChange}
                        placeholder="-32.889500, -68.846700"
                        className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono"
                        autoFocus
                      />
                      <button
                        onClick={() => setEditingCoords(false)}
                        className="px-3 py-2 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
                      >
                        Listo
                      </button>
                      <button
                        onClick={handleClearCoords}
                        className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : coords ? (
                    // Coordenadas confirmadas
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
                        {formatCoords(coords.latitude, coords.longitude)}
                      </span>
                      <button
                        onClick={() => setEditingCoords(true)}
                        className="text-xs text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        Editar
                      </button>
                      <button
                        onClick={handleClearCoords}
                        className="text-xs text-gray-500 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    // Sin coordenadas
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        Sin ubicación — el análisis se guardará sin GPS
                      </span>
                      <button
                        onClick={() => setEditingCoords(true)}
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                      >
                        Ingresar manualmente
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 dark:text-gray-600">
                    {coordsSource === 'exif'
                      ? 'Coordenadas extraídas del EXIF de la foto. Podés editarlas si es necesario.'
                      : coordsSource === 'device'
                      ? 'Ubicación actual del dispositivo. Podés editarla si es necesario.'
                      : 'Ingresá las coordenadas en formato: latitud, longitud (ej: -32.889500, -68.846700)'}
                  </p>
                </div>
              )}
            </div>

            {/* ── BOTÓN ANALIZAR ─────────────────────────────────── */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={handleAnalyze}
                className="flex items-center gap-3 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors duration-150 text-base shadow-glow"
              >
                <Brain size={20} />
                Analizar con IA
              </button>
              <p className="text-gray-600 text-xs">
                El análisis tarda entre 3 y 5 segundos
              </p>
            </div>
          </motion.div>
        )}

        {/* PASO 3: Analizando → mostrar loader animado */}
        {analysisStatus === 'analyzing' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AnalysisLoader />
          </motion.div>
        )}

        {/* PASO 4: Completado → mostrar resultados */}
        {analysisStatus === 'complete' && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ResultsCard />
          </motion.div>
        )}

        {/* ESTADO ERROR → mostrar mensaje de error */}
        {analysisStatus === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-900 border border-red-500/30 rounded-2xl p-8 text-center"
          >
            <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
            <h3 className="text-gray-900 dark:text-white font-semibold text-lg mb-2">
              Error en el análisis
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-sm mx-auto">
              {error || 'Ocurrió un error inesperado. Por favor, intentá de nuevo.'}
            </p>
            <button
              onClick={resetAnalysis}
              className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium px-5 py-2.5 rounded-xl transition-colors mx-auto"
            >
              <RefreshCw size={15} />
              Intentar de nuevo
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

// ── SUBCOMPONENTE: INDICADOR DE PASOS ─────────────────────────────────────────
function StepIndicator({ steps, activeStep }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const isCompleted = step.id < activeStep
        const isActive    = step.id === activeStep
        const isLast      = i === steps.length - 1

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div className={`
                w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                 ${isCompleted
                   ? 'bg-emerald-700 text-white'
                   : isActive
                     ? 'bg-emerald-700/30 text-emerald-400 border-2 border-emerald-500'
                     : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-600 border border-gray-300 dark:border-gray-700'
                }
              `}>
                {isCompleted ? '✓' : step.id}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${
                isActive ? 'text-emerald-400' : isCompleted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'
              }`}>
                {step.label}
              </span>
            </div>

            {!isLast && (
              <div className={`h-px flex-1 mx-2 mb-4 transition-all duration-300 ${
                isCompleted ? 'bg-emerald-700' : 'bg-gray-200 dark:bg-gray-800'
              }`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
