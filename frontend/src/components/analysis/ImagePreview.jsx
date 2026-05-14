// src/components/analysis/ImagePreview.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Muestra la imagen cargada con su metadata y botón para cambiarla.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle2, FileImage, Weight, Crop, Tag } from 'lucide-react'
import { useAnalysis } from '../../context/AnalysisContext'
import { formatFileSize, getImageDimensions, getFormatLabel } from '../../utils/validators'

export default function ImagePreview() {
  const { currentImage, imagePreview, resetAnalysis } = useAnalysis()

  // Estado local para las dimensiones (cargadas asíncronamente)
  const [dimensions, setDimensions] = useState(null)

  // Cargamos las dimensiones de la imagen cuando cambia currentImage
  useEffect(() => {
    if (!currentImage) return

    setDimensions(null) // Reset mientras carga

    getImageDimensions(currentImage)
      .then(dims => setDimensions(dims))
      .catch(() => setDimensions({ width: '?', height: '?' }))
  }, [currentImage])

  if (!currentImage || !imagePreview) return null

  return (
    <div className="w-full space-y-4">
      {/* ── IMAGEN PREVIEW ───────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        {/* La imagen en sí */}
        <img
          src={imagePreview}
          alt="Hoja seleccionada para análisis"
          className="w-full max-h-72 object-contain"
          style={{ background: 'linear-gradient(135deg, #111827 0%, #0f172a 100%)' }}
        />

        {/* Badge de validación sobre la imagen */}
        <div className="absolute top-3 right-3">
          <span className="flex items-center gap-1.5 bg-emerald-700/90 backdrop-blur text-white text-xs font-medium px-2.5 py-1 rounded-full">
            <CheckCircle2 size={12} />
            Imagen válida
          </span>
        </div>
      </div>

      {/* ── METADATA ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4">
        <h4 className="text-gray-900 dark:text-white font-medium text-sm mb-3 flex items-center gap-2">
          <FileImage size={14} className="text-emerald-500" />
          Información del archivo
        </h4>

        <div className="space-y-2">
          {/* Nombre del archivo */}
          <MetaRow
            icon={<Tag size={13} />}
            label="Archivo"
            value={currentImage.name}
            valueClass="truncate max-w-48"
          />

          {/* Tamaño */}
          <MetaRow
            icon={<Weight size={13} />}
            label="Tamaño"
            value={formatFileSize(currentImage.size)}
          />

          {/* Formato */}
          <MetaRow
            icon={<FileImage size={13} />}
            label="Formato"
            value={getFormatLabel(currentImage.type)}
            valueClass="font-mono"
          />

          {/* Dimensiones (carga asíncrona) */}
          <MetaRow
            icon={<Crop size={13} />}
            label="Dimensiones"
            value={
              dimensions
                ? `${dimensions.width} × ${dimensions.height} px`
                : 'Cargando...'
            }
          />

          {/* Estado de validación */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className="text-emerald-400 text-xs font-medium">
              Imagen válida — Lista para análisis
            </span>
          </div>
        </div>
      </div>

      {/* ── BOTÓN NUEVA IMAGEN ───────────────────────────────────────── */}
      <button
        onClick={resetAnalysis}
        className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-150 group"
        title="Seleccionar otra imagen"
      >
        <RefreshCw
          size={14}
          className="group-hover:rotate-180 transition-transform duration-300"
        />
        Usar otra imagen
      </button>
    </div>
  )
}

// ── SUBCOMPONENTE: FILA DE METADATA ──────────────────────────────────────
function MetaRow({ icon, label, value, valueClass = '' }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 text-xs flex-shrink-0">
        {icon}
        <span>{label}</span>
      </div>
      <span className={`text-gray-700 dark:text-gray-300 text-xs text-right ${valueClass}`}>
        {value}
      </span>
    </div>
  )
}
