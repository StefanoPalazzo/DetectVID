// src/utils/analysisMetrics.js
// Shared helpers for DetectVID history/dashboard metrics.

const DISEASE_BUCKETS = {
  healthy: {
    id: 'healthy',
    label: 'Sanas',
    match: ['healthy', 'sana', 'hoja_sana'],
    color: 'emerald',
  },
  oidio: {
    id: 'oidio',
    label: 'Oídio',
    match: ['oidio', 'powdery_mildew', 'powdery mildew', 'oídio'],
    color: 'red',
  },
  peronospora: {
    id: 'peronospora',
    label: 'Peronóspora',
    match: ['peronospora', 'downy_mildew', 'downy mildew', 'peronóspora'],
    color: 'amber',
  },
  uncertain: {
    id: 'uncertain',
    label: 'No concluyentes',
    match: ['uncertain', 'inconclusive', 'no_concluyente', 'no concluyente', 'otros', 'other', 'otra_anomalia'],
    color: 'slate',
  },
}

export const HISTORY_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'healthy', label: 'Sanas' },
  { id: 'oidio', label: 'Oídio' },
  { id: 'peronospora', label: 'Peronóspora' },
  { id: 'uncertain', label: 'No concluyentes' },
  { id: 'risk', label: 'Alto riesgo' },
]

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function getAnalysisDate(analysis) {
  const value = analysis?.createdAt ?? analysis?.created_at ?? analysis?.timestamp
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

export function getDiseaseBucket(analysis) {
  const haystack = [
    analysis?.diseaseKey,
    analysis?.diseaseName,
    analysis?.disease,
    analysis?.status,
  ].map(normalizeText).join(' ')

  for (const bucket of Object.values(DISEASE_BUCKETS)) {
    if (bucket.match.some(token => haystack.includes(normalizeText(token)))) return bucket.id
  }

  if (analysis?.riskColor === 'green') return 'healthy'
  if (analysis?.riskColor === 'red') return 'oidio'
  if (analysis?.riskColor === 'yellow') return 'peronospora'
  return 'uncertain'
}

export function isHighRisk(analysis) {
  const risk = normalizeText(analysis?.riskLevel)
  return analysis?.riskColor === 'red' || risk.includes('alto') || risk.includes('alta')
}

export function filterAnalyses(analyses, filter) {
  if (!filter || filter === 'all') return analyses
  if (filter === 'risk') return analyses.filter(isHighRisk)
  return analyses.filter(analysis => getDiseaseBucket(analysis) === filter)
}

export function buildAnalysisMetrics(analyses = []) {
  const total = analyses.length
  const counts = {
    healthy: 0,
    oidio: 0,
    peronospora: 0,
    uncertain: 0,
    highRisk: 0,
    withGps: 0,
  }

  for (const analysis of analyses) {
    counts[getDiseaseBucket(analysis)] += 1
    if (isHighRisk(analysis)) counts.highRisk += 1
    if (analysis.latitude != null && analysis.longitude != null) counts.withGps += 1
  }

  const diseaseTotal = counts.oidio + counts.peronospora
  const riskPercent = total ? Math.round((diseaseTotal / total) * 100) : 0
  const healthyPercent = total ? Math.round((counts.healthy / total) * 100) : 0
  const gpsPercent = total ? Math.round((counts.withGps / total) * 100) : 0

  const sorted = [...analyses].sort((a, b) => {
    const ad = getAnalysisDate(a)?.getTime() ?? 0
    const bd = getAnalysisDate(b)?.getTime() ?? 0
    return bd - ad
  })

  return {
    total,
    counts,
    diseaseTotal,
    riskPercent,
    healthyPercent,
    gpsPercent,
    latest: sorted[0] ?? null,
    distribution: [
      { id: 'healthy', label: DISEASE_BUCKETS.healthy.label, value: counts.healthy, color: 'bg-emerald-500' },
      { id: 'oidio', label: DISEASE_BUCKETS.oidio.label, value: counts.oidio, color: 'bg-red-500' },
      { id: 'peronospora', label: DISEASE_BUCKETS.peronospora.label, value: counts.peronospora, color: 'bg-amber-500' },
      { id: 'uncertain', label: DISEASE_BUCKETS.uncertain.label, value: counts.uncertain, color: 'bg-slate-400' },
    ],
    trend: buildRecentTrend(analyses),
  }
}

function buildRecentTrend(analyses) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    const key = d.toISOString().slice(0, 10)
    return { key, label: d.toLocaleDateString('es-AR', { weekday: 'short' }), total: 0, risk: 0 }
  })
  const byKey = new Map(days.map(day => [day.key, day]))

  for (const analysis of analyses) {
    const date = getAnalysisDate(analysis)
    if (!date) continue
    const key = date.toISOString().slice(0, 10)
    const day = byKey.get(key)
    if (!day) continue
    day.total += 1
    if (getDiseaseBucket(analysis) === 'oidio' || getDiseaseBucket(analysis) === 'peronospora') {
      day.risk += 1
    }
  }

  const max = Math.max(1, ...days.map(day => day.total))
  return days.map(day => ({ ...day, height: Math.max(8, Math.round((day.total / max) * 100)) }))
}

export function formatAnalysisDate(analysis, options = {}) {
  const date = getAnalysisDate(analysis)
  if (!date) return 'Sin fecha'
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  })
}
