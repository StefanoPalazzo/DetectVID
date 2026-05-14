// src/services/mlService.js
// ─────────────────────────────────────────────────────────────────────────────
// Servicio que llama a la API Python (FastAPI) para clasificar imágenes.
// Reemplaza al mockAnalysis — misma interfaz de respuesta, modelo real.
// ─────────────────────────────────────────────────────────────────────────────

const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:8000/api/ml'

// Mapeo de claves internas del modelo a los campos que espera el frontend
const CLASS_META = {
  healthy: {
    disease:     'Sana',
    diseaseKey:  'healthy',
    status:      'Sana',
    riskLevel:   'Bajo',
    riskColor:   'green',
    urgency:     'Sin urgencia',
    symptoms:    ['No se detectaron síntomas de enfermedad.'],
    recommendation: 'La hoja presenta un estado saludable. Continuar con el manejo preventivo habitual del viñedo.',
  },
  oidio: {
    disease:     'Oídio',
    diseaseKey:  'powdery_mildew',
    status:      'Enferma',
    riskLevel:   'Alto',
    riskColor:   'red',
    urgency:     'Inmediata',
    symptoms: [
      'Manchas blancas pulverulentas en el haz de la hoja',
      'Polvo grisáceo o blanco sobre la superficie foliar',
      'Deformación y rizado de brotes jóvenes',
      'Detención del crecimiento en zonas afectadas',
    ],
    recommendation:
      'Se detectó presencia de Oídio (Uncinula necator). Se recomienda aplicar ' +
      'fungicida azufrado o sistémico según la fenología del cultivo. ' +
      'Consultar con un ingeniero agrónomo para definir dosis y momento de aplicación.',
  },
  peronospora: {
    disease:     'Peronóspora',
    diseaseKey:  'downy_mildew',
    status:      'Enferma',
    riskLevel:   'Alto',
    riskColor:   'red',
    urgency:     'Inmediata',
    symptoms: [
      'Manchas amarillo-verdosas en el haz ("manchas de aceite")',
      'Pelusa blanca en el envés de la hoja (esporulación)',
      'Necrosis foliar en estadios avanzados',
      'Caída prematura de hojas afectadas',
    ],
    recommendation:
      'Se detectó presencia de Peronóspora (Plasmopara viticola). Aplicar ' +
      'fungicidas cúpricos o sistémicos específicos. La temperatura y humedad ' +
      'actuales favorecen el desarrollo. Revisión urgente del lote afectado.',
  },
}

/**
 * Clasifica una imagen de hoja de vid usando el modelo ML real.
 * Misma interfaz que analyzeLeafImage() del mock — el resto del código no cambia.
 *
 * @param {File} imageFile
 * @returns {Promise<object>} resultado de clasificación con el formato que espera ResultsCard
 */
export async function analyzeLeafImage(imageFile) {
  const formData = new FormData()
  formData.append('file', imageFile)

  const res = await fetch(`${ML_API_URL}/predict`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error del servidor ML: ${res.status}`)
  }

  const data = await res.json()
  // data = { predicted_class, display_name, confidence, probabilities, model_name }

  const meta = CLASS_META[data.predicted_class] ?? CLASS_META['healthy']
  const confidence = Math.round(data.confidence * 100)
  const affectedArea = meta.riskLevel === 'Bajo' ? 0 : Math.round((1 - data.confidence) * 60 + 10)

  // Mismo formato que devuelve mockAnalysis — ResultsCard espera esta estructura
  return {
    success:        true,
    analysisId:     `DVD-${Date.now()}`,
    timestamp:      new Date().toISOString(),
    processingTime: null,

    image: {
      name:       imageFile.name,
      size:       imageFile.size,
      type:       imageFile.type,
      dimensions: null,
      quality:    confidence > 70 ? 'good' : 'low',
    },

    result: {
      disease:        meta.disease,
      diseaseKey:     meta.diseaseKey,
      status:         meta.status,
      confidence,
      riskLevel:      meta.riskLevel,
      riskColor:      meta.riskColor,
      affectedArea:   meta.riskLevel === 'Bajo' ? '~0%' : `~${affectedArea}%`,
      urgency:        meta.urgency,
      symptoms:       meta.symptoms,
      recommendation: meta.recommendation,
    },

    model: {
      name:    data.model_name ?? 'DetectVID-v1',
      version: '1.0.0',
      type:    'local',
    },
  }
}
