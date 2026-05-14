// src/components/analysis/ResultsCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta premium de resultados del análisis de IA.
// Es el componente más importante del MVP — el "momento de verdad" del producto.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  Zap,
  Activity,
  Save,
  FileText,
  ChevronRight,
  Info,
} from 'lucide-react'
import { useAnalysis } from '../../context/AnalysisContext'

// ── MAPEO DE COLORES POR RIESGO ───────────────────────────────────────────
// Centralizado para consistencia visual en todo el componente
const RISK_CONFIG = {
  red: {
    border:       'border-l-4 border-red-500',
    badge:        'bg-red-500/20 text-red-400 border border-red-500/40',
    confidence:   'from-red-700 to-red-500',
    icon:         AlertCircle,
    iconClass:    'text-red-400',
    headerBg:     'bg-red-500/5',
  },
  yellow: {
    border:       'border-l-4 border-yellow-500',
    badge:        'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40',
    confidence:   'from-yellow-700 to-yellow-400',
    icon:         AlertTriangle,
    iconClass:    'text-yellow-400',
    headerBg:     'bg-yellow-500/5',
  },
  green: {
    border:       'border-l-4 border-emerald-500',
    badge:        'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
    confidence:   'from-vine-700 to-emerald-500',
    icon:         CheckCircle2,
    iconClass:    'text-emerald-400',
    headerBg:     'bg-emerald-500/5',
  },
  gray: {
    border:       'border-l-4 border-gray-500',
    badge:        'bg-gray-500/20 text-gray-400 border border-gray-500/40',
    confidence:   'from-gray-700 to-gray-500',
    icon:         HelpCircle,
    iconClass:    'text-gray-400',
    headerBg:     'bg-gray-500/5',
  },
}

export default function ResultsCard() {
  const { analysisResult, resetAnalysis } = useAnalysis()

  if (!analysisResult) return null

  const { result, model, processingTime, analysisId, timestamp } = analysisResult
  const config = RISK_CONFIG[result.riskColor] || RISK_CONFIG.gray
  const StatusIcon = config.icon

  // Formateamos la fecha para mostrarla de forma legible
  const formattedDate = new Date(timestamp).toLocaleString('es-AR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })

  return (
    // Framer Motion: el card entra con slide-up + fade
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full space-y-4"
    >
      {/* ── CARD PRINCIPAL ─────────────────────────────────────────── */}
      <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden ${config.border}`}>

        {/* ── HEADER: Estado + Enfermedad ──────────────────────────── */}
        <div className={`px-6 py-5 ${config.headerBg} border-b border-gray-200 dark:border-gray-800`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <StatusIcon size={22} className={`${config.iconClass} flex-shrink-0 mt-0.5`} />
              <div>
                {/* Nombre de la enfermedad — lo más importante visualmente */}
                <h3 className="text-gray-900 dark:text-white font-bold text-xl leading-tight">
                  {result.disease}
                </h3>
                {/* Estado general de la hoja */}
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                  Estado: <span className={`font-medium ${config.iconClass}`}>{result.status}</span>
                </p>
              </div>
            </div>

            {/* Badge de nivel de riesgo */}
            <span className={`text-sm font-semibold px-3 py-1 rounded-full flex-shrink-0 ${config.badge}`}>
              Riesgo: {result.riskLevel}
            </span>
          </div>

          {/* Metadata del análisis (ID + fecha) */}
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400 dark:text-gray-600">
            <span># {analysisId}</span>
            <span>•</span>
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* ── CUERPO DEL CARD ──────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-5">

          {/* ── CONFIANZA DEL MODELO ─────────────────────────────── */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1.5">
                <Activity size={13} />
                Confianza del modelo
              </span>
              <span className="text-gray-900 dark:text-white font-bold text-lg">{result.confidence}%</span>
            </div>
            {/* Barra de confianza */}
            <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${result.confidence}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                className={`h-full bg-gradient-to-r ${config.confidence} rounded-full`}
              />
            </div>
            {/* Interpretación de la confianza */}
            <p className="text-gray-400 dark:text-gray-600 text-xs mt-1">
              {result.confidence >= 85
                ? 'Alta certeza diagnóstica'
                : result.confidence >= 65
                  ? 'Certeza moderada — recomendamos confirmación agronómica'
                  : 'Certeza baja — requiere análisis presencial'
              }
            </p>
          </div>

          {/* ── DETALLES DEL ANÁLISIS ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <DetailBox
              icon={<Zap size={14} />}
              label="Urgencia"
              value={result.urgency}
              colorClass={result.riskColor === 'red' ? 'text-red-400' : result.riskColor === 'yellow' ? 'text-yellow-400' : 'text-emerald-400'}
            />
            <DetailBox
              icon={<Activity size={14} />}
              label="Área afectada"
              value={result.affectedArea}
              colorClass="text-gray-900 dark:text-white"
              tooltip="Porcentaje estimado de la superficie de la hoja con síntomas visibles de la enfermedad detectada."
            />
          </div>

          {/* ── SÍNTOMAS DETECTADOS ───────────────────────────────── */}
          <div>
            <h4 className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-2 flex items-center gap-1.5">
              <ChevronRight size={13} className="text-emerald-500" />
              Síntomas identificados
            </h4>
            <ul className="space-y-1.5">
              {result.symptoms.map((symptom, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  {/* Punto de bullet con color de riesgo */}
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${
                    result.riskColor === 'green' ? 'bg-emerald-500' :
                    result.riskColor === 'red'   ? 'bg-red-500' :
                    result.riskColor === 'yellow' ? 'bg-yellow-500' : 'bg-gray-500'
                  }`} />
                  {symptom}
                </li>
              ))}
            </ul>
          </div>

          {/* ── RECOMENDACIÓN ─────────────────────────────────────── */}
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800 dark:text-amber-200 text-sm font-medium mb-1">Recomendación</p>
                <p className="text-amber-900/90 dark:text-amber-100/80 text-sm leading-relaxed">
                  {result.recommendation}
                </p>
                <p className="text-amber-700 dark:text-amber-500/70 text-xs mt-2">
                  ⚠ Este análisis es orientativo. Consulte siempre con un ingeniero agrónomo certificado antes de tomar decisiones de tratamiento.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* ── FOOTER DEL CARD: Info del modelo ─────────────────────── */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-600">
            <Clock size={11} />
            <span>Procesado en {(processingTime / 1000).toFixed(1)}s</span>
            <span>•</span>
            <span>{model.name} v{model.version}</span>
            <span>•</span>
            <span className="uppercase font-mono">{model.type}</span>
          </div>
        </div>
      </div>

      {/* ── BOTONES DE ACCIÓN ──────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        {/* Botón principal: nuevo análisis */}
        <button
          onClick={resetAnalysis}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-medium px-5 py-2.5 rounded-xl transition-colors duration-150"
        >
          <RefreshCw size={15} />
          Nuevo Análisis
        </button>

        {/* Botones deshabilitados (próximas versiones) */}
        <button
          disabled
          title="Disponible en versión 2.0"
          className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium px-5 py-2.5 rounded-xl cursor-not-allowed opacity-60"
        >
          <Save size={15} />
          Guardar Resultado
          <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded ml-1">v2.0</span>
        </button>

        <button
          disabled
          title="Disponible en versión 2.0"
          className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium px-5 py-2.5 rounded-xl cursor-not-allowed opacity-60"
        >
          <FileText size={15} />
          Exportar PDF
          <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded ml-1">v2.0</span>
        </button>
      </div>
    </motion.div>
  )
}

// ── SUBCOMPONENTE: CAJA DE DETALLE ────────────────────────────────────────
function DetailBox({ icon, label, value, colorClass, tooltip }) {
  return (
    <div className="bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl p-3">
      {/* Label con ícono y, opcionalmente, ícono de info con tooltip */}
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs mb-1">
        {icon}
        <span>{label}</span>
        {tooltip && (
          <span className="relative group ml-auto cursor-default">
            <Info size={11} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" />
            {/* Tooltip — aparece al hacer hover */}
            <span className="
              pointer-events-none absolute bottom-full right-0 mb-1.5
              w-52 bg-gray-900 dark:bg-gray-700 text-white text-xs leading-relaxed
              px-3 py-2 rounded-lg shadow-lg
              opacity-0 group-hover:opacity-100
              transition-opacity duration-150 z-10
            ">
              {tooltip}
              {/* Flecha del tooltip */}
              <span className="absolute top-full right-2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
            </span>
          </span>
        )}
      </div>
      <p className={`font-semibold text-sm ${colorClass}`}>{value}</p>
    </div>
  )
}
