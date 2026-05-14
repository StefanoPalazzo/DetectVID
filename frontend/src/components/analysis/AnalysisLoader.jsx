// src/components/analysis/AnalysisLoader.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Animación de carga mostrada mientras el modelo de IA procesa la imagen.
// Simula progreso con pasos visuales para dar feedback al usuario.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, CheckCircle2, Loader2 } from 'lucide-react'

// Pasos del proceso de análisis con sus duraciones aproximadas
// El usuario ve estos pasos avanzar mientras espera
const ANALYSIS_STEPS = [
  { id: 0, label: 'Preparando imagen...',                       duration: 700  },
  { id: 1, label: 'Extrayendo características visuales...',     duration: 1100 },
  { id: 2, label: 'Ejecutando modelo DetectVID AI...',          duration: 1400 },
  { id: 3, label: 'Generando diagnóstico y recomendaciones...', duration: 1000 },
]

export default function AnalysisLoader() {
  // Índice del paso actualmente activo (0 a 3)
  const [currentStep, setCurrentStep] = useState(0)

  // Progreso de la barra (0 a 100)
  const [progress, setProgress] = useState(0)

  // Avanzamos los pasos de forma secuencial usando los tiempos definidos
  useEffect(() => {
    let stepIndex = 0
    let totalElapsed = 0
    const totalDuration = ANALYSIS_STEPS.reduce((sum, s) => sum + s.duration, 0)

    // Para cada paso, programamos un timeout con el tiempo acumulado
    const timers = ANALYSIS_STEPS.map((step) => {
      const timer = setTimeout(() => {
        setCurrentStep(step.id)
        // Calculamos el progreso proporcional al avance de los pasos
        const progressPercent = Math.round(
          ((totalElapsed + step.duration) / totalDuration) * 95
        )
        setProgress(progressPercent)
      }, totalElapsed)

      totalElapsed += step.duration
      return timer
    })

    // Limpieza: si el componente se desmonta antes, cancelamos los timers
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    // AnimatePresence de Framer Motion permite animar la entrada/salida del componente
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8"
    >
      {/* ── ÍCONO ANIMADO ─────────────────────────────────────────── */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          {/* Anillo pulsante exterior */}
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
          {/* Círculo con ícono */}
          <div className="relative w-16 h-16 rounded-full gradient-vine flex items-center justify-center shadow-glow">
            <Cpu size={28} className="text-white animate-pulse" />
          </div>
        </div>
      </div>

      {/* ── TÍTULO ───────────────────────────────────────────────── */}
      <div className="text-center mb-6">
        <h3 className="text-gray-900 dark:text-white font-semibold text-lg">
          Analizando con DetectVID AI
        </h3>
        <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
          Este proceso puede tardar entre 3 y 5 segundos
        </p>
      </div>

      {/* ── BARRA DE PROGRESO ─────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500 mb-2">
          <span>Procesando...</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          {/* La barra avanza suavemente usando transición CSS */}
          <div
            className="h-full bg-gradient-to-r from-vine-700 to-emerald-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── LISTA DE PASOS ───────────────────────────────────────── */}
      <div className="space-y-3">
        {ANALYSIS_STEPS.map((step) => {
          const isCompleted = step.id < currentStep
          const isActive    = step.id === currentStep

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 transition-all duration-300 ${
                isCompleted
                  ? 'opacity-100'
                  : isActive
                    ? 'opacity-100'
                    : 'opacity-30'
              }`}
            >
              {/* Ícono del paso */}
              <div className="flex-shrink-0">
                {isCompleted ? (
                  <CheckCircle2 size={16} className="text-emerald-400" />
                ) : isActive ? (
                  <Loader2 size={16} className="text-emerald-400 animate-spin" />
                ) : (
                  // Círculo vacío para pasos futuros
                  <div className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600" />
                )}
              </div>

              {/* Texto del paso */}
              <span className={`text-sm ${
                isActive ? 'text-gray-900 dark:text-white font-medium' : isCompleted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'
              }`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Nota informativa al pie */}
      <p className="text-center text-gray-400 dark:text-gray-600 text-xs mt-6">
        🔒 La imagen se procesa de forma segura y no se almacena en servidores externos
      </p>
    </motion.div>
  )
}
