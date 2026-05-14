// src/pages/Home.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Página de inicio de DetectVID.
// Presenta el producto, sus capacidades, y el estado del proyecto.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import { Link } from 'react-router-dom'
import {
  ScanLine, Brain, Zap, ClipboardList,
  BarChart2, Map, Wifi, GraduationCap, ArrowRight,
  Leaf, ShieldCheck,
} from 'lucide-react'

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 overflow-hidden">
        {/* Decoración de fondo */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-700/5 rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-vine-800/10 rounded-full translate-y-1/2 -translate-x-1/3 pointer-events-none" />

        <div className="relative">
          {/* Badge de versión */}
          <span className="inline-flex items-center gap-1.5 bg-emerald-700/20 border border-emerald-700/40 text-emerald-400 text-xs font-medium px-3 py-1 rounded-full mb-4">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            v1.0.0 MVP — En desarrollo activo
          </span>

          {/* Título principal */}
          <h1 className="text-gray-900 dark:text-white font-bold text-3xl md:text-4xl leading-tight mb-3">
            Bienvenido a{' '}
            <span className="text-gradient-vine">DetectVID</span>
          </h1>

          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl leading-relaxed mb-6">
            Sistema de <strong className="text-gray-700 dark:text-gray-200">detección temprana de enfermedades en vid</strong> mediante
            inteligencia artificial. Subí una foto de una hoja y obtené un diagnóstico instantáneo.
          </p>

          {/* CTA principal */}
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

      {/* ── STATS (mock — fase 1) ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
            Estadísticas
          </p>
          <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-600 text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
            Demo
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard value="0" label="Análisis realizados"     note="Esta sesión" />
          <StatCard value="0" label="Enfermedades detectadas" note="Total histórico" />
          <StatCard value="0" label="Hectáreas monitoreadas"  note="Disponible en v2.0" />
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
            description="Clasifica Oídio, Peronóspora, Botrytis y hojas sanas con hasta 95% de precisión en condiciones controladas."
            iconBg="bg-emerald-700/20 text-emerald-400"
            available
          />
          <FeatureCard
            icon={<Zap size={20} />}
            title="Análisis Instantáneo"
            description="Resultado en 3-5 segundos. Sin necesidad de conectividad especial ni hardware adicional."
            iconBg="bg-blue-700/20 text-blue-400"
            available
          />
          <FeatureCard
            icon={<ShieldCheck size={20} />}
            title="Recomendaciones"
            description="Cada diagnóstico incluye nivel de riesgo, urgencia de acción y recomendación agronómica básica."
            iconBg="bg-violet-700/20 text-violet-400"
            available
          />
        </div>
      </div>

      {/* ── PRÓXIMAS FUNCIONALIDADES ──────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-gray-900 dark:text-white font-semibold text-xl">Roadmap</h2>
          <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs px-2.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
            Próximas versiones
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RoadmapCard
            icon={<ClipboardList size={18} />}
            title="Historial de Análisis"
            version="v2.0"
            description="Registro histórico de todos los análisis realizados, con filtros por fecha, enfermedad y resultado."
          />
          <RoadmapCard
            icon={<BarChart2 size={18} />}
            title="Dashboard Analítico"
            version="v2.0"
            description="Estadísticas por sector, evolución temporal de enfermedades y tendencias del viñedo."
          />
          <RoadmapCard
            icon={<Map size={18} />}
            title="Mapa GPS del Viñedo"
            version="v3.0"
            description="Geolocalización de análisis, heatmaps por enfermedad y monitoreo sector por sector."
          />
          <RoadmapCard
            icon={<Wifi size={18} />}
            title="Modo Offline + Drones"
            version="v3.0"
            description="Análisis sin conexión a internet e integración con capturas aéreas desde drones."
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
              artificial a la viticultura de precisión, haciendo el monitoreo fitosanitario más
              accesible, económico y escalable para productores de todos los tamaños.
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

// ── SUBCOMPONENTES ────────────────────────────────────────────────────────

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

function RoadmapCard({ icon, title, version, description }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 border-dashed rounded-2xl p-5 hover:bg-white dark:hover:bg-gray-900 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          {icon}
          <span className="font-medium text-sm">{title}</span>
        </div>
        <span className="bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-xs px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
          {version}
        </span>
      </div>
      <p className="text-gray-400 dark:text-gray-500 text-sm leading-relaxed">{description}</p>
    </div>
  )
}
