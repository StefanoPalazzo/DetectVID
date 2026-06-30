// src/pages/Home.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Página de inicio de DetectVID.
// Presenta el producto, sus capacidades, y el estado real del usuario.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ScanLine, Brain, Zap, GraduationCap, ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { getAnalyses } from '../services/analysisService'
import { getFincas } from '../services/fincaService'

export default function Home() {
  const [analyses, setAnalyses] = useState([])
  const [zones, setZones] = useState([])
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadStats() {
      try {
        const [analysisData, fincaData] = await Promise.allSettled([
          getAnalyses({ limit: 500 }),
          getFincas(),
        ])

        if (cancelled) return

        if (analysisData.status === 'fulfilled') {
          const payload = analysisData.value
          setAnalyses(Array.isArray(payload) ? payload : (payload.analyses ?? []))
        }

        if (fincaData.status === 'fulfilled') {
          const payload = fincaData.value
          setZones(Array.isArray(payload) ? payload : (payload.fincas ?? []))
        }
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    }

    loadStats()
    return () => { cancelled = true }
  }, [])

  const stats = useMemo(() => {
    const diseaseCount = analyses.filter(isDiseaseAnalysis).length
    return {
      total: analyses.length,
      diseases: diseaseCount,
      zones: zones.length,
    }
  }, [analyses, zones])

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-700/5 rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-vine-800/10 rounded-full translate-y-1/2 -translate-x-1/3 pointer-events-none" />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 bg-emerald-700/20 border border-emerald-700/40 text-emerald-400 text-xs font-medium px-3 py-1 rounded-full mb-4">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            v2.0.5 MVP — En desarrollo activo
          </span>

          <h1 className="text-gray-900 dark:text-white font-bold text-3xl md:text-4xl leading-tight mb-3">
            Bienvenido a <span className="text-gradient-vine">DetectVID</span>
          </h1>

          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl leading-relaxed mb-6">
            Sistema de <strong className="text-gray-700 dark:text-gray-200">detección temprana de enfermedades en vid</strong> mediante
            inteligencia artificial. Subí una foto de una hoja y obtené un diagnóstico instantáneo.
          </p>

          <Link
            to="/analyze"
            className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors duration-150 shadow-glow"
          >
            <ScanLine size={18} />
            Comenzar Análisis
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* ── STATS REALES ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
            Estadísticas
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard value={statsLoading ? '…' : stats.total} label="Análisis realizados" note="Total histórico" />
          <StatCard value={statsLoading ? '…' : stats.diseases} label="Enfermedades detectadas" note="Resultados con riesgo" />
          <StatCard value={statsLoading ? '…' : stats.zones} label="Zonas agregadas" note="Fincas o sectores creados" />
        </div>
      </div>

      {/* ── CAPACIDADES DEL SISTEMA ───────────────────────────────── */}
      <div>
        <h2 className="text-gray-900 dark:text-white font-semibold text-xl mb-4">
          Capacidades del Sistema
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            icon={<Brain size={20} />}
            title="Detección con IA"
            description="Clasifica Oídio, Peronóspora, Otras enfermedades y hojas sanas con el modelo entrenado de DetectVID."
            iconBg="bg-emerald-700/20 text-emerald-400"
            available
          />
          <FeatureCard
            icon={<Zap size={20} />}
            title="Análisis Instantáneo"
            description="Resultado en pocos segundos desde la web o desde la app móvil, con sincronización cuando vuelve la conexión."
            iconBg="bg-blue-700/20 text-blue-400"
            available
          />
          <FeatureCard
            icon={<ShieldCheck size={20} />}
            title="Recomendaciones"
            description="Cada diagnóstico incluye nivel de riesgo, confianza del modelo y recomendación agronómica básica."
            iconBg="bg-violet-700/20 text-violet-400"
            available
          />
        </div>
      </div>

      {/* ── INFO ACADÉMICA ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-700/20 flex items-center justify-center flex-shrink-0">
            <GraduationCap size={20} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-gray-900 dark:text-white font-semibold mb-1">Proyecto de Tesis Académica</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
              DetectVID es desarrollado como proyecto de tesis en la{' '}
              <strong className="text-gray-700 dark:text-gray-200">Universidad de Mendoza</strong>.
              El objetivo es demostrar la viabilidad de aplicar visión computacional e inteligencia
              artificial a la viticultura de precisión.
            </p>
            <p className="text-gray-400 dark:text-gray-600 text-xs mt-2">
              Autor: Stefano Palazzo • Ingeniería • 2026
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}

function isDiseaseAnalysis(analysis) {
  const key = String(analysis.diseaseKey || '').toLowerCase()
  const name = String(analysis.diseaseName || analysis.disease || '').toLowerCase()
  return !['healthy', 'sana', 'no_conclusive', 'no concluyente'].some(token => key.includes(token) || name.includes(token))
}

function StatCard({ value, label, note }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 text-center">
      <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{value}</p>
      <p className="text-gray-600 dark:text-gray-300 text-sm font-medium">{label}</p>
      <p className="text-gray-400 dark:text-gray-600 text-xs mt-0.5">{note}</p>
    </div>
  )
}

function FeatureCard({ icon, title, description, iconBg, available }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${iconBg}`}>{icon}</div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-gray-900 dark:text-white font-semibold">{title}</h3>
        {available && (
          <span className="bg-emerald-700/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-700/40">
            Activo
          </span>
        )}
      </div>
      <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  )
}
