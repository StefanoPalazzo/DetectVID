// src/pages/History.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Página de Historial de Análisis.
//
// Funcionalidades:
//   - Carga análisis del backend al montar
//   - Agrupa por Día / Semana / Mes (tabs)
//   - Muestra miniatura, enfermedad, confianza, fecha, GPS
//   - Modal de foto en tamaño completo
//   - Eliminación individual y por grupo (con confirmación)
//   - UI optimista: elimina del estado local antes de confirmar con el backend
//   - Estado de carga (skeleton), vacío y error
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList, ScanLine, ArrowRight, Trash2, MapPin,
  X, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Calendar,
} from 'lucide-react'
import clsx from 'clsx'
import {
  format,
  parseISO,
  startOfWeek,
  isToday,
  isYesterday,
} from 'date-fns'
import { es } from 'date-fns/locale'

import { getAnalyses, deleteAnalysis, deleteAnalyses } from '../services/analysisService'

// ── Mapa de colores por nivel de riesgo ──────────────────────────────────────
const RISK_COLORS = {
  red:    'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30',
  green:  'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30',
  gray:   'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
  yellow: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30',
}

// ── Tabs de agrupación ────────────────────────────────────────────────────────
const GROUP_TABS = [
  { id: 'day',   label: 'Por día'   },
  { id: 'week',  label: 'Por semana' },
  { id: 'month', label: 'Por mes'   },
]

// ── Helpers de agrupación ─────────────────────────────────────────────────────

/** Obtiene la clave de agrupación según el modo seleccionado */
function getGroupKey(dateStr, mode) {
  const date = parseISO(dateStr)
  if (mode === 'day')   return format(date, 'yyyy-MM-dd')
  if (mode === 'week')  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  if (mode === 'month') return format(date, 'yyyy-MM')
  return format(date, 'yyyy-MM-dd')
}

/** Formatea la etiqueta visible del grupo */
function getGroupLabel(key, mode) {
  if (mode === 'day') {
    const date = parseISO(key)
    if (isToday(date))     return 'Hoy'
    if (isYesterday(date)) return 'Ayer'
    return format(date, "dd 'de' MMMM yyyy", { locale: es })
  }
  if (mode === 'week') {
    const date = parseISO(key)
    return `Semana del ${format(date, 'dd MMM', { locale: es })}`
  }
  if (mode === 'month') {
    // "yyyy-MM" → "Abril 2025"
    const date = parseISO(`${key}-01`)
    const label = format(date, 'MMMM yyyy', { locale: es })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  return key
}

/** Agrupa un array de análisis por el modo dado. Devuelve [{ key, label, items }] */
function groupAnalyses(analyses, mode) {
  const map = new Map()
  for (const analysis of analyses) {
    const key = getGroupKey(analysis.createdAt, mode)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(analysis)
  }
  // Convertir a array, ordenado de más reciente a más antiguo
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ key, label: getGroupLabel(key, mode), items }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: SkeletonCard — placeholder animado durante la carga
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-4 animate-pulse">
      {/* Encabezado del grupo */}
      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-32" />
      {/* Filas */}
      {[0, 1, 2].map(i => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gray-200 dark:bg-gray-800 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded w-40" />
            <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-24" />
          </div>
          <div className="h-6 w-16 bg-gray-200 dark:bg-gray-800 rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: PhotoModal — muestra la foto en tamaño completo
// ─────────────────────────────────────────────────────────────────────────────
function PhotoModal({ analysis, onClose }) {
  // Cerrar con Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!analysis) return null

  const date = parseISO(analysis.createdAt)

  return (
    <AnimatePresence>
      <motion.div
        key="photo-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
        onClick={onClose}  // Cerrar al hacer clic fuera
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="relative max-w-2xl w-full bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}  // Evitar cierre al hacer clic en el modal
        >
          {/* Botón cerrar */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
            aria-label="Cerrar modal"
          >
            <X size={16} />
          </button>

          {/* Imagen */}
          <img
            src={analysis.imageUrl}
            alt={`Análisis: ${analysis.diseaseName}`}
            className="w-full max-h-[70vh] object-contain bg-gray-100 dark:bg-gray-950"
          />

          {/* Footer del modal */}
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-4">
            <div>
              <p className="text-gray-900 dark:text-white font-semibold text-sm">
                {analysis.diseaseName}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                {format(date, "dd 'de' MMMM yyyy — HH:mm", { locale: es })}
              </p>
            </div>
            <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', RISK_COLORS[analysis.riskColor] || RISK_COLORS.gray)}>
              {analysis.confidence}% confianza
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: ConfirmDialog — diálogo de confirmación antes de eliminar
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmDialog({ count, onConfirm, onCancel }) {
  // Cerrar con Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  const esPlural = count > 1

  return (
    <motion.div
      key="confirm-dialog"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ícono de advertencia */}
        <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center mb-4">
          <Trash2 size={20} className="text-red-600 dark:text-red-400" />
        </div>

        <h3 className="text-gray-900 dark:text-white font-semibold text-base mb-2">
          ¿Eliminar {count} {esPlural ? 'análisis' : 'análisis'}?
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
          Esta acción no se puede deshacer. {esPlural ? 'Los registros eliminados' : 'El registro eliminado'} no se podrá recuperar.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            Confirmar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: AnalysisRow — fila de un análisis individual
// ─────────────────────────────────────────────────────────────────────────────
function AnalysisRow({ analysis, onPhotoClick, onDelete }) {
  const date = parseISO(analysis.createdAt)
  const riskClass = RISK_COLORS[analysis.riskColor] || RISK_COLORS.gray

  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 dark:border-gray-800/70 last:border-0 group">

      {/* Miniatura — clic abre el modal */}
      <button
        onClick={() => onPhotoClick(analysis)}
        className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800 hover:ring-2 hover:ring-emerald-500 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500"
        aria-label="Ver foto completa"
      >
        {analysis.imageUrl ? (
          <img
            src={analysis.imageUrl}
            alt={analysis.diseaseName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ScanLine size={20} className="text-gray-400" />
          </div>
        )}
      </button>

      {/* Info principal */}
      <div className="flex-1 min-w-0">
        <p className="text-gray-900 dark:text-white font-medium text-sm truncate">
          {analysis.diseaseName}
        </p>
        <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
          {format(date, "HH:mm · dd/MM/yyyy", { locale: es })}
        </p>
      </div>

      {/* Badge de riesgo */}
      <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 hidden sm:inline-flex', riskClass)}>
        {analysis.diseaseName}
      </span>

      {/* Confianza */}
      <span className="text-gray-600 dark:text-gray-400 text-sm font-medium flex-shrink-0 w-12 text-right hidden md:block">
        {analysis.confidence}%
      </span>

      {/* Badge GPS */}
      {analysis.latitude != null && analysis.longitude != null && (
        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 rounded-full flex-shrink-0 hidden lg:inline-flex">
          <MapPin size={10} />
          GPS
        </span>
      )}

      {/* Botón eliminar individual */}
      <button
        onClick={() => onDelete([analysis.id])}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
        aria-label="Eliminar análisis"
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: GroupCard — una tarjeta con el grupo de análisis
// ─────────────────────────────────────────────────────────────────────────────
function GroupCard({ group, onPhotoClick, onDelete }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      {/* Header del grupo */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-gray-700 dark:text-gray-300 font-semibold text-sm">
            {group.label}
          </span>
          <span className="text-gray-400 dark:text-gray-600 text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {group.items.length}
          </span>
          {expanded
            ? <ChevronUp size={14} className="text-gray-400" />
            : <ChevronDown size={14} className="text-gray-400" />
          }
        </button>

        {/* Botón "Eliminar grupo" */}
        <button
          onClick={() => onDelete(group.items.map(i => i.id))}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 transition-colors"
        >
          <Trash2 size={12} />
          Eliminar grupo
        </button>
      </div>

      {/* Filas — colapsables */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="rows"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {group.items.map(analysis => (
              <AnalysisRow
                key={analysis.id}
                analysis={analysis}
                onPhotoClick={onPhotoClick}
                onDelete={onDelete}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal: History
// ─────────────────────────────────────────────────────────────────────────────
export default function History() {
  // ── Estado ──────────────────────────────────────────────────────────────────
  const [analyses, setAnalyses]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [groupMode, setGroupMode]       = useState('day')
  const [photoModal, setPhotoModal]     = useState(null)   // analysis | null
  const [confirmPending, setConfirmPending] = useState(null) // { ids: [] } | null

  // Ref para rollback en caso de error al eliminar
  const rollbackRef = useRef(null)

  // ── Carga inicial ────────────────────────────────────────────────────────────
  const fetchAnalyses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getAnalyses()
      // El backend puede devolver { analyses: [] } o directamente un array
      setAnalyses(Array.isArray(data) ? data : (data.analyses ?? []))
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalyses()
  }, [fetchAnalyses])

  // ── Eliminar con UI optimista ─────────────────────────────────────────────────
  const handleDeleteRequest = useCallback((ids) => {
    setConfirmPending({ ids })
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmPending) return
    const { ids } = confirmPending

    // Guardamos snapshot para rollback
    rollbackRef.current = analyses
    setConfirmPending(null)

    // Actualización optimista: sacamos los ids del estado local
    setAnalyses(prev => prev.filter(a => !ids.includes(a.id)))

    try {
      if (ids.length === 1) {
        await deleteAnalysis(ids[0])
      } else {
        await deleteAnalyses(ids)
      }
      rollbackRef.current = null
    } catch {
      // Rollback: restauramos el estado anterior
      if (rollbackRef.current) {
        setAnalyses(rollbackRef.current)
        rollbackRef.current = null
      }
      setError('No se pudo eliminar. Intentá de nuevo.')
    }
  }, [confirmPending, analyses])

  const handleCancelDelete = useCallback(() => {
    setConfirmPending(null)
  }, [])

  // ── Grupos calculados ────────────────────────────────────────────────────────
  const groups = groupAnalyses(analyses, groupMode)

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
            <ClipboardList size={16} className="text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-gray-900 dark:text-white font-bold text-2xl">Historial de Análisis</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Registro de todos tus diagnósticos</p>
          </div>
        </div>

        {/* Total de análisis */}
        {!loading && !error && analyses.length > 0 && (
          <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm font-medium px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 flex-shrink-0">
            <Calendar size={13} />
            {analyses.length} {analyses.length === 1 ? 'análisis' : 'análisis'}
          </span>
        )}
      </div>

      {/* ── ERROR ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 rounded-xl px-5 py-4 flex items-center gap-3">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button
            onClick={fetchAnalyses}
            className="flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <RefreshCw size={13} />
            Reintentar
          </button>
        </div>
      )}

      {/* ── LOADING SKELETON ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* ── ESTADO VACÍO ─────────────────────────────────────────────────────── */}
      {!loading && !error && analyses.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 border-dashed rounded-2xl p-12 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <ClipboardList size={28} className="text-gray-400 dark:text-gray-500" />
          </div>
          <h2 className="text-gray-900 dark:text-white font-semibold text-lg mb-2">
            Todavía no hay análisis
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto mb-6">
            Cuando analices una hoja, los resultados van a aparecer acá agrupados por fecha.
          </p>
          <Link
            to="/analyze"
            className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            <ScanLine size={15} />
            Analizar una hoja
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      )}

      {/* ── CONTENIDO PRINCIPAL ──────────────────────────────────────────────── */}
      {!loading && !error && analyses.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Tabs de agrupación */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/60 p-1 rounded-xl w-fit">
            {GROUP_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setGroupMode(tab.id)}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  groupMode === tab.id
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Grupos */}
          <div className="space-y-4">
            {groups.map(group => (
              <GroupCard
                key={group.key}
                group={group}
                onPhotoClick={setPhotoModal}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── MODAL DE FOTO ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {photoModal && (
          <PhotoModal
            analysis={photoModal}
            onClose={() => setPhotoModal(null)}
          />
        )}
      </AnimatePresence>

      {/* ── DIÁLOGO DE CONFIRMACIÓN ───────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmPending && (
          <ConfirmDialog
            count={confirmPending.ids.length}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
