// src/pages/Dashboard.jsx
// Página de Dashboard Analítico — disponible en versión 2.0

import React from 'react'
import { Link } from 'react-router-dom'
import { BarChart2, Lock, ScanLine, ArrowRight, TrendingUp, PieChart, Activity } from 'lucide-react'

export default function Dashboard() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <BarChart2 size={16} className="text-gray-500 dark:text-gray-400" />
          </div>
          <div>
            <h1 className="text-gray-900 dark:text-white font-bold text-2xl">Dashboard General</h1>
            <p className="text-gray-400 dark:text-gray-500 text-sm">Estadísticas y analítica de tu finca</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm font-medium px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 flex-shrink-0">
          <Lock size={12} />
          Disponible en v2.0
        </span>
      </div>

      {/* ── AVISO ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 border-dashed rounded-2xl p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
          <BarChart2 size={20} className="text-gray-400 dark:text-gray-500" />
        </div>
        <div className="flex-1">
          <h2 className="text-gray-900 dark:text-white font-semibold mb-1">Dashboard en desarrollo</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Las estadísticas completas estarán disponibles en v2.0. Por ahora podés usar el módulo de análisis individual.
          </p>
          <Link
            to="/analyze"
            className="inline-flex items-center gap-2 mt-3 text-emerald-400 hover:text-emerald-300 text-sm font-medium transition-colors"
          >
            Ir a Analizar Hoja <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* ── STATS PLACEHOLDER ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Análisis',     value: '—', icon: <Activity size={16} /> },
          { label: 'Detecciones Oídio',  value: '—', icon: <TrendingUp size={16} /> },
          { label: 'Detecciones Perono', value: '—', icon: <TrendingUp size={16} /> },
          { label: 'Hojas Sanas',        value: '—', icon: <Activity size={16} /> },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 opacity-50">
            <div className="text-gray-500 mb-2">{s.icon}</div>
            <p className="text-2xl font-bold text-gray-600 mb-1">{s.value}</p>
            <p className="text-gray-600 text-xs">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── CHARTS PLACEHOLDER ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Chart 1: Línea */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 opacity-40">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-gray-400 dark:text-gray-500" />
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Evolución de Enfermedades</p>
          </div>
          {/* Fake line chart */}
          <div className="h-36 flex items-end justify-between gap-1 px-2">
            {[30, 45, 25, 60, 40, 75, 55, 80, 50, 65, 45, 70].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-gray-300 dark:bg-gray-700 rounded-t opacity-60"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-gray-400 dark:text-gray-700 text-xs">
            <span>Ene</span><span>Mar</span><span>Jun</span><span>Sep</span><span>Dic</span>
          </div>
        </div>

        {/* Chart 2: Barras */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 opacity-40">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={14} className="text-gray-400 dark:text-gray-500" />
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Distribución por Enfermedad</p>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Oídio',       w: '65%', color: 'bg-red-600' },
              { label: 'Peronóspora', w: '45%', color: 'bg-orange-600' },
              { label: 'Botrytis',    w: '30%', color: 'bg-yellow-600' },
              { label: 'Sana',        w: '80%', color: 'bg-emerald-600' },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-gray-400 dark:text-gray-600 text-xs w-20 flex-shrink-0">{b.label}</span>
                <div className="flex-1 bg-gray-200 dark:bg-gray-800 rounded h-3">
                  <div className={`h-full rounded ${b.color}`} style={{ width: b.w }} />
                </div>
                <span className="text-gray-400 dark:text-gray-700 text-xs w-8 text-right">{b.w}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <p className="text-center text-gray-400 dark:text-gray-700 text-xs">
        Los datos mostrados son de ejemplo para ilustrar el diseño del dashboard. En v2.0 mostrarán tus datos reales.
      </p>
    </div>
  )
}
