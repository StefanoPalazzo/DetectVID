// src/services/mlService.js
// ─────────────────────────────────────────────────────────────────────────────
// Servicio que llama a la API Python (FastAPI) para clasificar imágenes.
// Reemplaza al mockAnalysis — misma interfaz de respuesta, modelo real.
// ─────────────────────────────────────────────────────────────────────────────

const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:8000/api/ml'

async function imageFileForPrediction(imageFile) {
  if (!imageFile?.type?.startsWith('image/')) return imageFile
  if (imageFile.size <= 900_000) return imageFile

  const imageUrl = URL.createObjectURL(imageFile)
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = imageUrl
    })

    const maxSide = 1024
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.drawImage(image, 0, 0, width, height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob) return imageFile

    return new File(
      [blob],
      imageFile.name.replace(/\.[^.]+$/, '') + '-ml.jpg',
      { type: 'image/jpeg', lastModified: imageFile.lastModified }
    )
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

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
  others: {
    disease:     'Otra enfermedad o daño',
    diseaseKey:  'others',
    status:      'No clasificada',
    riskLevel:   'Medio',
    riskColor:   'yellow',
    urgency:     'Revisión recomendada',
    symptoms: [
      'La imagen parece mostrar síntomas que no corresponden claramente a oídio ni peronóspora.',
      'Puede tratarse de otra enfermedad, daño fisiológico, quemadura, deficiencia nutricional o senescencia.',
    ],
    recommendation:
      'El modelo detectó un patrón fuera de las clases principales. Se recomienda tomar una foto cercana adicional ' +
      'y consultar con un ingeniero agrónomo antes de decidir un tratamiento.',
  },
  uncertain: {
    disease:     'Resultado incierto',
    diseaseKey:  'uncertain',
    status:      'Incierto',
    riskLevel:   'Indeterminado',
    riskColor:   'gray',
    urgency:     'Repetir foto',
    symptoms: [
      'El modelo no tiene suficiente certeza para emitir un diagnóstico confiable.',
      'La foto puede tener poca luz, reflejos, distancia excesiva, encuadre incompleto o síntomas ambiguos.',
    ],
    recommendation:
      'Repetí la captura con una hoja o racimo en primer plano, buena iluminación, foco nítido y sin sombras fuertes. ' +
      'Si el síntoma persiste, compará varias hojas de la misma planta y pedí confirmación agronómica.',
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
  const predictionFile = await imageFileForPrediction(imageFile)
  const formData = new FormData()
  formData.append('file', predictionFile)

  const t0 = Date.now()
  const res = await fetch(`${ML_API_URL}/predict`, {
    method: 'POST',
    body: formData,
  })
  const processingMs = Date.now() - t0

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error del servidor ML: ${res.status}`)
  }

  const data = await res.json()
  // data = { predicted_class, display_name, confidence, top1_margin, is_uncertain, decision_status, probabilities, model_name }

  const meta = data.is_uncertain
    ? CLASS_META.uncertain
    : CLASS_META[data.predicted_class] ?? CLASS_META.uncertain
  const confidence = Math.round(data.confidence * 100)
  const affectedArea = ['Bajo', 'Indeterminado'].includes(meta.riskLevel)
    ? 0
    : Math.round((1 - data.confidence) * 60 + 10)

  // Mismo formato que devuelve mockAnalysis — ResultsCard espera esta estructura
  return {
    success:        true,
    analysisId:     `DVD-${Date.now()}`,
    timestamp:      new Date().toISOString(),
    processingTime: processingMs,

    image: {
      name:       imageFile.name,
      size:       imageFile.size,
      type:       imageFile.type,
      dimensions: null,
      quality:    data.is_uncertain ? 'low' : confidence > 70 ? 'good' : 'low',
    },

    result: {
      disease:        meta.disease,
      diseaseKey:     meta.diseaseKey,
      status:         meta.status,
      confidence,
      riskLevel:      meta.riskLevel,
      riskColor:      meta.riskColor,
      affectedArea:   meta.riskLevel === 'Indeterminado'
        ? 'No estimada'
        : meta.riskLevel === 'Bajo'
          ? '~0%'
          : `~${affectedArea}%`,
      urgency:        meta.urgency,
      symptoms:       meta.symptoms,
      recommendation: meta.recommendation,
      rawPrediction:  data.predicted_class,
      decisionStatus: data.decision_status,
      isUncertain:    data.is_uncertain,
      top1Margin:     Math.round((data.top1_margin ?? 0) * 100),
      thresholds:     data.thresholds,
      probabilities:  data.probabilities,
    },

    model: {
      name:    data.model_name ?? 'DetectVID-v1',
      version: '1.0.0',
      type:    'local',
    },
  }
}
