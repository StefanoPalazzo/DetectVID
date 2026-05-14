// src/components/analysis/UploadZone.jsx — con soporte dark/light mode

import React, { useRef, useState, useCallback } from 'react'
import { ImagePlus, AlertCircle, FileImage } from 'lucide-react'
import clsx from 'clsx'
import { useAnalysis } from '../../context/AnalysisContext'
import { validateImageFile } from '../../utils/validators'

export default function UploadZone() {
  const { setImage } = useAnalysis()
  const [isDragging, setIsDragging] = useState(false)
  const [error,      setError     ] = useState(null)
  const inputRef = useRef(null)

  const processFile = useCallback((file) => {
    setError(null)
    const validation = validateImageFile(file)
    if (!validation.valid) {
      setError(validation.error)
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setImage(file, previewUrl)
  }, [setImage])

  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true)  }, [])
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }, [])
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    const files = e.dataTransfer.files
    if (files?.length > 0) processFile(files[0])
  }, [processFile])

  const handleClick = () => inputRef.current?.click()
  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  return (
    <div className="w-full">
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={clsx(
          'relative flex flex-col items-center justify-center',
          'min-h-64 w-full rounded-2xl border-2 border-dashed',
          'cursor-pointer select-none transition-all duration-200',
          error
            ? 'border-red-400 bg-red-50 dark:bg-red-500/5 hover:bg-red-100 dark:hover:bg-red-500/8'
            : isDragging
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shadow-glow'
              : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:border-emerald-500/60 hover:bg-gray-100 dark:hover:bg-gray-800/50'
        )}
        role="button"
        tabIndex={0}
        aria-label="Zona de carga de imagen"
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleInputChange}
          className="hidden"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center gap-4 px-8 py-10 text-center pointer-events-none">
          <div className={clsx(
            'w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200',
            isDragging
              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : error
                ? 'bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
          )}>
            {isDragging ? <FileImage size={32} /> : <ImagePlus size={32} />}
          </div>

          <div>
            <p className={clsx(
              'text-lg font-semibold',
              isDragging
                ? 'text-emerald-700 dark:text-emerald-400'
                : error
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-white'
            )}>
              {isDragging ? '¡Soltá la imagen aquí!' : 'Arrastrá tu imagen aquí'}
            </p>
            <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
              o <span className="text-emerald-600 dark:text-emerald-500 font-medium">hacé click para seleccionar</span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            {['JPG', 'JPEG', 'PNG', 'WEBP'].map(fmt => (
              <span
                key={fmt}
                className="bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-2 py-0.5 rounded font-mono border border-gray-300 dark:border-gray-700"
              >
                {fmt}
              </span>
            ))}
            <span className="text-gray-400 dark:text-gray-600 text-xs">• Máximo 10 MB</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-xl">
          <AlertCircle size={16} className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      <p className="text-center text-gray-400 dark:text-gray-600 text-xs mt-3">
        Para mejores resultados, asegurate de que la hoja ocupe la mayor parte de la imagen y esté bien iluminada.
      </p>
    </div>
  )
}
