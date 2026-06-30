// src/pages/Dashboard.jsx
// Dashboard productivo con métricas calculadas desde el historial real del usuario.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  ClipboardList,
  Leaf,
  Loader2,
  MapPin,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Sprout,
  TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import { getAnalyses } from '../services/analysisService'
import { buildAnalysisMetrics, formatAnalysisDate } from '../utils/analysisMetrics'
import { normalizeImageUrl } from '../utils/imageUrl'

const CARD_STYLES = {
  emerald: 'from-emerald-500/18 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  red: 'from-red-500/18 to-red-500/5 text-red-600 dark:text-red-400 border-red-500/20',
  amber: 'from-amber-500/18 to-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20',
  slate: 'from-slate-500/18 to-slate-500/5 text-slate-600 dark:text-slate-300 border-slate-500/20',
}

export default function Dashboard() {
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getAnalyses({ limit: 200 })
      setAnalyses(Array.isArray(data) ? data : (data.analyses ?? []))
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las métricas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const metrics = useMemo(() => buildAnalysisMetrics(analyses), [analyses])
  const healthLabel = metrics.total === 0
    ? 'Sin datos'
    : metrics.riskPercent >= 50
      ? 'Atención alta'
      : metrics.riskPercent >= 25
        ? 'Monitoreo preventivo'
        : 'Estado favorable'

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950 via-gray-950 to-slate-950 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.22),transparent_60%)]" />
        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-white/8 px-3 py-1 text-xs font-medium text-emerald-100 mb-4">
              <Leaf size={13} /> Monitoreo inteligente del viñedo
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Dashboard DetectVID</h1>
            <p className="text-emerald-50/75 mt-2 leading-relaxed">
              Resumen operativo de análisis, riesgo sanitario, ubicación de muestras y evolución reciente para tomar mejores decisiones en campo.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-[280px]">
            <HeroMetric label="Análisis" value={metrics.total} />
            <HeroMetric label="Riesgo" value={`${metrics.riskPercent}%`} />
          </div>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <DashboardSkeleton />
      ) : metrics.total === 0 && !error ? (
        <EmptyDashboard />
      ) : !error && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard icon={Activity} label="Total de análisis" value={metrics.total} hint="Historial sincronizado" color="slate" />
            <MetricCard icon={CheckCircle2} label="Hojas sanas" value={metrics.counts.healthy} hint={`${metrics.healthyPercent}% del total`} color="emerald" />
            <MetricCard icon={ShieldAlert} label="Oídio detectado" value={metrics.counts.oidio} hint="Casos compatibles" color="red" />
            <MetricCard icon={Sprout} label="Peronóspora" value={metrics.counts.peronospora} hint="Casos compatibles" color="amber" />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">
            <Panel title="Evolución reciente" icon={TrendingUp} subtitle="Últimos 7 días de actividad">
              <div className="h-64 flex items-end gap-3 pt-8">
                {metrics.trend.map(day => (
                  <div key={day.key} className="flex-1 flex flex-col items-center gap-2">
                    <div className="relative w-full max-w-14 h-44 flex items-end rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="w-full rounded-t-full bg-gradient-to-t from-emerald-700 to-emerald-400 transition-all"
                        style={{ height: `${day.height}%` }}
                        title={`${day.total} análisis`}
                      />
                      {day.risk > 0 && (
                        <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-red-500 bg-white/80 dark:bg-gray-950/80 rounded-full px-1.5">
                          {day.risk}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-500 capitalize">{day.label}</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{day.total}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Distribución sanitaria" icon={BarChart2} subtitle={healthLabel}>
              <div className="space-y-4">
                {metrics.distribution.map(item => {
                  const width = metrics.total ? Math.max(4, Math.round((item.value / metrics.total) * 100)) : 0
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{item.label}</span>
                        <span className="text-gray-500 dark:text-gray-400">{item.value}</span>
                      </div>
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className={clsx('h-full rounded-full', item.color)} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/60 p-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Lectura rápida</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {metrics.riskPercent >= 50
                    ? 'Hay una proporción alta de detecciones. Conviene revisar sectores cercanos y repetir capturas.'
                    : metrics.riskPercent >= 25
                      ? 'Hay señales moderadas. Mantené monitoreo y priorizá las zonas con GPS.'
                      : 'La mayoría de análisis no muestra riesgo alto. Continuá con monitoreo preventivo.'}
                </p>
              </div>
            </Panel>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Panel title="Último análisis" icon={ScanLine} className="lg:col-span-2">
              {metrics.latest ? <LatestAnalysis analysis={metrics.latest} /> : null}
            </Panel>

            <Panel title="Cobertura GPS" icon={MapPin} subtitle={`${metrics.gpsPercent}% con ubicación`}>
              <div className="flex items-center justify-center py-4">
                <div className="relative w-36 h-36 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ background: `conic-gradient(#10b981 ${metrics.gpsPercent * 3.6}deg, transparent 0deg)` }}
                  />
                  <div className="relative w-28 h-28 rounded-full bg-white dark:bg-gray-900 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-800">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">{metrics.gpsPercent}%</span>
                    <span className="text-xs text-gray-500 dark:text-gray-500">geolocalizado</span>
                  </div>
                </div>
              </div>
              <Link to="/map" className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2.5 text-sm font-medium transition-colors">
                Ver mapa <ArrowRight size={14} />
              </Link>
            </Panel>
          </section>
        </>
      )}
    </div>
  )
}

function HeroMetric({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur px-4 py-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-emerald-50/70">{label}</p>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, hint, color }) {
  return (
    <div className={clsx('rounded-2xl border bg-gradient-to-br p-5', CARD_STYLES[color])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-gray-950 dark:text-white">{value}</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-1">{label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{hint}</p>
        </div>
        <div className="w-11 h-11 rounded-2xl bg-white/70 dark:bg-gray-950/50 flex items-center justify-center border border-current/10">
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function Panel({ title, subtitle, icon: Icon, className, children }) {
  return (
    <div className={clsx('rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="flex items-center gap-2 text-gray-900 dark:text-white font-bold">
            {Icon && <Icon size={17} className="text-emerald-600 dark:text-emerald-400" />}
            {title}
          </h2>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function LatestAnalysis({ analysis }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="w-full sm:w-44 h-36 rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
        {analysis.imageUrl ? (
          <img src={normalizeImageUrl(analysis.imageUrl)} alt={analysis.diseaseName || analysis.disease} className="w-full h-full object-cover" />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400"><Leaf size={32} /></div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{analysis.diseaseName || analysis.disease}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{formatAnalysisDate(analysis)}</p>
          </div>
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            {analysis.confidence}%
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-4 line-clamp-3">
          {analysis.recommendation || 'Sin recomendación registrada.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/history" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Ver historial <ArrowRight size={14} />
          </Link>
          <Link to="/analyze" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600">
            Nuevo análisis <ScanLine size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl bg-gray-200 dark:bg-gray-800" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="h-80 rounded-3xl bg-gray-200 dark:bg-gray-800" />
        <div className="h-80 rounded-3xl bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  )
}

function EmptyDashboard() {
  return (
    <div className="rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-10 text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
        <BarChart2 size={30} />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Todavía no hay métricas</h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto mt-2">
        El dashboard se completa automáticamente cuando guardás análisis. Empezá cargando una hoja del viñedo.
      </p>
      <Link to="/analyze" className="inline-flex items-center gap-2 mt-6 bg-emerald-700 hover:bg-emerald-600 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
        Analizar una hoja <ArrowRight size={14} />
      </Link>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-5 py-4 text-red-700 dark:text-red-300 flex items-center gap-3">
      <AlertCircle size={17} />
      <span className="text-sm flex-1">{message}</span>
      <button onClick={onRetry} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
        <RefreshCw size={13} /> Reintentar
      </button>
    </div>
  )
}
