// src/pages/VineyardMap.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Mapa interactivo del viñedo con:
//   • Marcadores coloreados por tipo de enfermedad (análisis con GPS)
//   • Polígonos de fincas dibujados por el usuario
//   • Herramienta de dibujo via @geoman-io/leaflet-geoman-free
//   • CRUD completo de fincas contra el backend
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon, Tooltip, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
// leaflet-control-geocoder se registra como side-effect en L.Control.Geocoder
import 'leaflet-control-geocoder/dist/Control.Geocoder.css'
import 'leaflet-control-geocoder'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Map, Plus, Trash2, Edit3, X, Check, Info, Loader2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'
import { getFincas, createFinca, deleteFinca } from '../services/fincaService'

// ── Fix de íconos de Leaflet para Vite ────────────────────────────────────────
// Vite no copia los PNGs de leaflet/dist/images al build automáticamente.
// Hay que referenciarlos explícitamente con import.meta.url para que Vite
// los incluya en el bundle y resuelva las URLs correctamente.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
  shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
})

// ── Constantes ────────────────────────────────────────────────────────────────
const API_URL    = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Centro por defecto: Mendoza, Argentina
const MENDOZA_CENTER = [-32.8895, -68.8458]
const MENDOZA_ZOOM   = 11

// Paleta de colores predefinidos para las fincas
const FINCA_COLORS = [
  { label: 'Verde',   value: '#16a34a' },
  { label: 'Azul',    value: '#2563eb' },
  { label: 'Ámbar',   value: '#d97706' },
  { label: 'Rojo',    value: '#dc2626' },
  { label: 'Violeta', value: '#7c3aed' },
  { label: 'Cian',    value: '#0891b2' },
]

// Mapeo de riskColor a estilos visuales del círculo en el mapa.
// "red" y "yellow" = enfermedad → zona de alerta
// "green"          = sana       → zona saludable
// "gray"           = no concluyente → zona neutra
const RISK_CIRCLE = {
  red:    { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.25 },
  yellow: { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.25 },
  green:  { color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.20 },
  gray:   { color: '#6b7280', fillColor: '#6b7280', fillOpacity: 0.15 },
}

// Radio del círculo en metros — lo suficientemente visible en zoom de viñedo
const ANALYSIS_RADIUS = 25

// ── Utilidades ────────────────────────────────────────────────────────────────

// ── Sub-componente: inicializa Geoman y escucha el evento de creación ─────────
/**
 * GeomanControls vive dentro de <MapContainer> para poder acceder al mapa
 * via useMap(). Al desmontar, limpia el listener para evitar fugas de memoria.
 *
 * Fix #1 — primer punto desplazado:
 *   Leaflet calcula coordenadas usando getBoundingClientRect(). Si el contenedor
 *   tiene un transform o no terminó de pintar, el cálculo está desviado en el
 *   primer click. invalidateSize() fuerza a Leaflet a recalcular las dimensiones
 *   reales antes de activar el modo de dibujo.
 *
 * Fix #2 — buscador de ubicación:
 *   Agrega el control leaflet-control-geocoder (Nominatim, sin API key).
 *   Al seleccionar un resultado, el mapa hace fly al lugar buscado.
 */
function GeomanControls({ drawingActive, onPolygonCreated }) {
  const map = useMap()

  // Agregar el buscador de ubicación una sola vez al montar
  useEffect(() => {
    if (!map) return

    // leaflet-control-geocoder se registra como side-effect en L.Control.Geocoder
    // Nominatim — sin API key, filtrado a Argentina
    const GeocoderClass = L.Control.Geocoder
    if (!GeocoderClass) return   // guard: no romper si el paquete no cargó

    const geocoder = new GeocoderClass({
      defaultMarkGeocode: false,
      placeholder:        'Buscar lugar…',
      errorMessage:       'No se encontró ningún resultado.',
      geocoder: L.Control.Geocoder.nominatim({
        geocodingQueryParams: { countrycodes: 'ar', limit: 5 },
      }),
    })

    geocoder.on('markgeocode', (e) => {
      map.flyToBounds(e.geocode.bbox, { padding: [20, 20], maxZoom: 16 })
    })

    geocoder.addTo(map)

    // Forzar recálculo de tamaño al montar (previene el primer punto desplazado)
    map.invalidateSize()

    return () => { map.removeControl(geocoder) }
  }, [map])

  // Escuchar la creación de un nuevo polígono
  useEffect(() => {
    if (!map) return

    map.pm.setGlobalOptions({ snappable: true, snapDistance: 20 })

    function handleCreate(e) {
      if (e.shape !== 'Polygon') return
      const latlngs = e.layer.getLatLngs()[0].map(ll => ({ lat: ll.lat, lng: ll.lng }))
      map.removeLayer(e.layer)
      onPolygonCreated(latlngs)
    }

    map.on('pm:create', handleCreate)
    return () => { map.off('pm:create', handleCreate) }
  }, [map, onPolygonCreated])

  // Activar/desactivar modo de dibujo + invalidateSize antes de empezar
  useEffect(() => {
    if (!map) return
    if (drawingActive) {
      // Recalcular dimensiones justo antes de activar el dibujo
      // para que el primer click mapee correctamente a coordenadas
      map.invalidateSize()
      map.pm.enableDraw('Polygon')
    } else {
      map.pm.disableDraw()
    }
  }, [map, drawingActive])

  return null
}

// ── Sub-componente: ajusta el viewport del mapa a los bounds de las fincas ────
function FitBounds({ fincas }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current || fincas.length === 0) return
    try {
      const allCoords = fincas.flatMap(f => f.coordinates)
      if (allCoords.length === 0) return
      const bounds = L.latLngBounds(allCoords.map(c => [c.lat, c.lng]))
      map.fitBounds(bounds, { padding: [40, 40] })
      fitted.current = true
    } catch {
      // Si falla el ajuste, mantener el centro por defecto
    }
  }, [fincas, map])

  return null
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function VineyardMap() {
  const { user } = useAuth()

  // Estado de datos
  const [fincas,    setFincas]    = useState([])
  const [analyses,  setAnalyses]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // Estado de UI del dibujo
  const [drawingActive,     setDrawingActive]     = useState(false)
  const [drawnCoords,       setDrawnCoords]       = useState(null)   // coords temporales del polígono dibujado
  const [showFincaModal,    setShowFincaModal]     = useState(false)  // modal para nombrar finca nueva
  const [newFincaName,      setNewFincaName]       = useState('')
  const [newFincaColor,     setNewFincaColor]      = useState(FINCA_COLORS[0].value)
  const [savingFinca,       setSavingFinca]        = useState(false)
  const [fincaError,        setFincaError]         = useState(null)

  // Estado de la finca seleccionada para edición/eliminación
  const [selectedFinca,     setSelectedFinca]      = useState(null)
  const [confirmDelete,     setConfirmDelete]      = useState(null)   // ID de la finca a eliminar

  // ── Carga inicial de datos ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // Cargar fincas y análisis en paralelo
        const [fincasData, analysesData] = await Promise.allSettled([
          getFincas(),
          fetch(`${API_URL}/analyses`, { credentials: 'include' }).then(r => r.json()),
        ])

        if (fincasData.status === 'fulfilled') {
          setFincas(fincasData.value?.fincas ?? fincasData.value ?? [])
        }

        if (analysesData.status === 'fulfilled') {
          // Filtrar solo los análisis que tienen coordenadas GPS
          const all = analysesData.value?.analyses ?? analysesData.value ?? []
          setAnalyses(all.filter(a => a.latitude != null && a.longitude != null))
        }
      } catch (err) {
        setError('No se pudieron cargar los datos del mapa.')
      } finally {
        setLoading(false)
      }
    }

    if (user) loadData()
  }, [user])

  // ── Callback cuando Geoman termina de dibujar un polígono ──────────────────
  const handlePolygonCreated = useCallback((coords) => {
    setDrawnCoords(coords)
    setDrawingActive(false)
    setShowFincaModal(true)
    setNewFincaName('')
    setNewFincaColor(FINCA_COLORS[0].value)
    setFincaError(null)
  }, [])

  // ── Guardar nueva finca ─────────────────────────────────────────────────────
  async function handleSaveFinca() {
    if (!newFincaName.trim()) {
      setFincaError('El nombre es obligatorio.')
      return
    }
    if (!drawnCoords || drawnCoords.length < 3) {
      setFincaError('El polígono no tiene suficientes puntos.')
      return
    }

    setSavingFinca(true)
    setFincaError(null)
    try {
      const created = await createFinca({
        name:        newFincaName.trim(),
        color:       newFincaColor,
        coordinates: drawnCoords,
      })
      setFincas(prev => [...prev, created?.finca ?? created])
      setShowFincaModal(false)
      setDrawnCoords(null)
    } catch (err) {
      setFincaError(err.message || 'No se pudo guardar la finca.')
    } finally {
      setSavingFinca(false)
    }
  }

  // ── Cancelar nuevo polígono ─────────────────────────────────────────────────
  function handleCancelDraw() {
    setShowFincaModal(false)
    setDrawnCoords(null)
    setDrawingActive(false)
  }

  // ── Eliminar finca ──────────────────────────────────────────────────────────
  async function handleDeleteFinca(id) {
    try {
      await deleteFinca(id)
      setFincas(prev => prev.filter(f => f.id !== id))
      setSelectedFinca(null)
      setConfirmDelete(null)
    } catch (err) {
      setError('No se pudo eliminar la finca.')
    }
  }

  // ── Bloquear scroll del layout cuando el mapa está activo ──────────────────
  // El <main> del layout tiene overflow-y-auto por defecto (necesario para el
  // resto de las páginas). Para el mapa necesitamos overflow-hidden para que
  // el mapa ocupe exactamente el espacio disponible sin generar scroll.
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    main.style.overflow = 'hidden'
    return () => { main.style.overflow = '' }   // restaurar al desmontar
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950 overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Map size={16} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-gray-900 dark:text-white font-bold text-xl leading-tight">
              Mapa del Viñedo
            </h1>
            <p className="text-gray-400 dark:text-gray-500 text-xs">
              {fincas.length > 0
                ? `${fincas.length} finca${fincas.length !== 1 ? 's' : ''} · ${analyses.length} análisis con GPS`
                : 'Dibujá tus parcelas y visualizá análisis con GPS'}
            </p>
          </div>
        </div>

        {/* Botón principal de acción */}
        <button
          onClick={() => {
            setSelectedFinca(null)
            setShowFincaModal(false)
            setDrawingActive(v => !v)
          }}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
            drawingActive
              ? 'bg-amber-500 hover:bg-amber-400 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white',
          )}
        >
          {drawingActive ? (
            <><X size={15} /> Cancelar dibujo</>
          ) : (
            <><Plus size={15} /> Agregar finca</>
          )}
        </button>
      </div>

      {/* ── Cuerpo principal: mapa + sidebar ────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Mapa ────────────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-w-0">

          {/* Banner informativo: modo dibujo activo */}
          {drawingActive && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 pointer-events-none">
              <Edit3 size={14} />
              Hacé clic en el mapa para dibujar el polígono de tu finca. Cerrá con doble clic.
            </div>
          )}

          {/* Banner: no hay análisis con GPS */}
          {!loading && analyses.length === 0 && fincas.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs px-4 py-2 rounded-xl shadow-md flex items-center gap-2 pointer-events-none">
              <Info size={13} />
              Los análisis con GPS aparecerán como marcadores en el mapa
            </div>
          )}

          {loading ? (
            // Estado de carga
            <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <Loader2 size={28} className="animate-spin text-emerald-500" />
                <span className="text-sm">Cargando mapa…</span>
              </div>
            </div>
          ) : (
            <div style={{ height: '100%', minHeight: '500px' }}>
              <MapContainer
                center={MENDOZA_CENTER}
                zoom={MENDOZA_ZOOM}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
              >
                {/* Capa de tiles de OpenStreetMap — sin API key */}
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                {/* Ajustar viewport a las fincas al montar */}
                <FitBounds fincas={fincas} />

                {/* Controles de dibujo Geoman */}
                <GeomanControls
                  drawingActive={drawingActive}
                  onPolygonCreated={handlePolygonCreated}
                />

                {/* ── Polígonos de fincas ─────────────────────────────────── */}
                {fincas.map(finca => (
                  <Polygon
                    key={finca.id}
                    positions={finca.coordinates.map(c => [c.lat, c.lng])}
                    pathOptions={{
                      color:       finca.color || '#16a34a',
                      fillColor:   finca.color || '#16a34a',
                      fillOpacity: selectedFinca?.id === finca.id ? 0.55 : 0.25,
                      weight:      selectedFinca?.id === finca.id ? 3 : 2,
                    }}
                    eventHandlers={{
                      click: () => setSelectedFinca(
                        selectedFinca?.id === finca.id ? null : finca
                      ),
                    }}
                  >
                    <Tooltip sticky direction="top" offset={[0, -6]}>
                      <span className="font-medium">{finca.name}</span>
                    </Tooltip>
                  </Polygon>
                ))}

                {/* ── Zonas de análisis con GPS ────────────────────────── */}
                {/* Círculo rojo = enfermedad detectada, verde = sana, gris = no concluyente */}
                {analyses.map(analysis => {
                  const style = RISK_CIRCLE[analysis.riskColor] ?? RISK_CIRCLE.gray
                  return (
                    <Circle
                      key={analysis.id}
                      center={[analysis.latitude, analysis.longitude]}
                      radius={ANALYSIS_RADIUS}
                      pathOptions={{ ...style, weight: 2 }}
                    >
                      <Popup>
                        <div className="min-w-[180px] text-sm">
                          {analysis.imageUrl && (
                            <img
                              src={analysis.imageUrl}
                              alt="Imagen del análisis"
                              className="w-full h-24 object-cover rounded mb-2"
                              onError={e => { e.target.style.display = 'none' }}
                            />
                          )}
                          <p className="font-semibold text-gray-900 leading-tight">
                            {analysis.disease || 'Sin clasificar'}
                          </p>
                          <p className="text-gray-500 text-xs mt-0.5">
                            Confianza: {analysis.confidence ?? '—'}%
                          </p>
                          {analysis.createdAt && (
                            <p className="text-gray-400 text-xs mt-1">
                              {format(new Date(analysis.createdAt), "d 'de' MMMM yyyy", { locale: es })}
                            </p>
                          )}
                        </div>
                      </Popup>
                    </Circle>
                  )
                })}

              </MapContainer>
            </div>
          )}

          {/* Empty state: sin fincas */}
          {!loading && fincas.length === 0 && !drawingActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-[500] pointer-events-none">
              <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-2xl px-8 py-6 text-center shadow-xl max-w-xs">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                  <Map size={22} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-gray-900 dark:text-white font-semibold text-base mb-1">
                  Dibujá tu primera finca
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-xs">
                  Usá el botón <strong>"Agregar finca"</strong> para trazar el perímetro de tu parcela en el mapa.
                </p>
                {/* Flecha decorativa apuntando al botón */}
                <div className="mt-3 text-emerald-500 text-lg">↑</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar: lista de fincas ─────────────────────────────────────── */}
        <aside className="w-64 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
          <div className="p-4">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
              Fincas ({fincas.length})
            </p>

            {error && (
              <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-3">
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            {fincas.length === 0 && !loading && (
              <p className="text-gray-400 dark:text-gray-600 text-xs text-center py-6">
                No hay fincas todavía.
                <br />Usá "Agregar finca" para empezar.
              </p>
            )}

            {/* Lista de fincas */}
            <ul className="space-y-2">
              {fincas.map(finca => (
                <li key={finca.id}>
                  <div
                    onClick={() => setSelectedFinca(
                      selectedFinca?.id === finca.id ? null : finca
                    )}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all group',
                      selectedFinca?.id === finca.id
                        ? 'bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700'
                        : 'hover:bg-white dark:hover:bg-gray-800/60',
                    )}
                  >
                    {/* Punto de color de la finca */}
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: finca.color || '#16a34a' }}
                    />
                    <span className="text-gray-800 dark:text-gray-200 text-sm font-medium truncate flex-1">
                      {finca.name}
                    </span>

                    {/* Acciones: solo visibles cuando está seleccionada */}
                    {selectedFinca?.id === finca.id && (
                      <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                        {confirmDelete === finca.id ? (
                          // Confirmación de eliminación
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteFinca(finca.id) }}
                              className="p-1 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                              title="Confirmar eliminación"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete(null) }}
                              className="p-1 rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              title="Cancelar"
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(finca.id) }}
                            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Eliminar finca"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/* Leyenda de marcadores */}
            {analyses.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                  Leyenda
                </p>
                <ul className="space-y-1.5">
                  {[
                    { color: '#ef4444', label: 'Enfermedad detectada' },
                    { color: '#16a34a', label: 'Hoja sana' },
                    { color: '#f59e0b', label: 'Riesgo moderado' },
                    { color: '#6b7280', label: 'No concluyente' },
                  ].map(item => (
                    <li key={item.label} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 border-2 border-white shadow-sm"
                        style={{ background: item.color }}
                      />
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Modal: nombrar y colorear la nueva finca ────────────────────────── */}
      {showFincaModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          {/* Overlay oscuro */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleCancelDraw}
          />

          {/* Tarjeta del modal */}
          <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <h2 className="text-gray-900 dark:text-white font-semibold text-base mb-1">
              Nueva finca
            </h2>
            <p className="text-gray-400 dark:text-gray-500 text-xs mb-5">
              Dale un nombre y elegí un color para identificarla en el mapa.
            </p>

            {/* Campo de nombre */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Nombre de la finca
              </label>
              <input
                type="text"
                value={newFincaName}
                onChange={e => setNewFincaName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveFinca() }}
                placeholder="Ej: Parcela Norte, Bloque A…"
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Selector de color */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {FINCA_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setNewFincaColor(c.value)}
                    title={c.label}
                    className={clsx(
                      'w-8 h-8 rounded-full border-2 transition-transform hover:scale-110',
                      newFincaColor === c.value
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-transparent',
                    )}
                    style={{ background: c.value }}
                  />
                ))}
              </div>
            </div>

            {/* Error */}
            {fincaError && (
              <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4">
                <AlertCircle size={13} />
                {fincaError}
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-3">
              <button
                onClick={handleCancelDraw}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveFinca}
                disabled={savingFinca || !newFincaName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {savingFinca ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Check size={15} />
                )}
                Guardar finca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
