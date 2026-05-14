// src/services/mockAnalysis.js
// ─────────────────────────────────────────────────────────────────────────────
// Servicio de análisis mock (simulado) para DetectVID MVP
//
// Este archivo simula lo que haría un modelo de IA real.
// La INTERFAZ (los parámetros y el formato de respuesta) es idéntica
// a lo que devolvería una API real. Esto significa que cuando tengas
// el modelo real, solo cambiás la IMPLEMENTACIÓN de esta función,
// no el código que la llama.
//
// Opciones para reemplazar este mock:
//   A) TensorFlow.js local  → ver sección "INTEGRACIÓN TENSORFLOW"
//   B) FastAPI / Flask API  → ver sección "INTEGRACIÓN FASTAPI"
//   C) CoreML / ONNX local  → ver sección "INTEGRACIÓN ONNX"
// ─────────────────────────────────────────────────────────────────────────────

// ── ESCENARIOS DE ENFERMEDAD ───────────────────────────────────────────────
// Array con todos los posibles resultados que puede devolver el modelo.
// En el mock los elegimos al azar. El modelo real calcularía la probabilidad.
const DISEASE_SCENARIOS = [
  {
    disease:      'Oídio',
    diseaseKey:   'powdery_mildew',
    status:       'Enferma',
    // confidence se randomiza dentro del rango al generar el resultado
    confidenceRange: [86, 95],
    riskLevel:    'Alto',
    riskColor:    'red',
    affectedAreaRange: [25, 55],
    urgency:      'Inmediata',
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
  {
    disease:      'Peronóspora',
    diseaseKey:   'downy_mildew',
    status:       'Enferma',
    confidenceRange: [80, 92],
    riskLevel:    'Alto',
    riskColor:    'red',
    affectedAreaRange: [20, 50],
    urgency:      'Inmediata',
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
  {
    disease:      'Hoja Sana',
    diseaseKey:   'healthy',
    status:       'Sana',
    confidenceRange: [92, 99],
    riskLevel:    'Sin riesgo',
    riskColor:    'green',
    affectedAreaRange: [0, 2],
    urgency:      'Monitorear',
    symptoms: [
      'Color verde uniforme y brillante',
      'Lámina foliar íntegra sin lesiones visibles',
      'Nerviación normal y bien definida',
    ],
    recommendation:
      'La hoja analizada no presenta signos visibles de enfermedad. ' +
      'Continuar con el monitoreo preventivo habitual. ' +
      'Se recomienda mantener el seguimiento periódico del viñedo.',
  },
  {
    disease:      'No concluyente',
    diseaseKey:   'inconclusive',
    status:       'No concluyente',
    confidenceRange: [40, 62],
    riskLevel:    'Indeterminado',
    riskColor:    'gray',
    affectedAreaRange: [0, 20],
    urgency:      'Monitorear',
    symptoms: [
      'La imagen no presenta suficiente información diagnóstica',
      'Posibles síntomas inespecíficos o imagen de baja calidad',
    ],
    recommendation:
      'El modelo no pudo determinar con confianza el estado sanitario de la hoja. ' +
      'Se recomienda tomar una nueva foto con mejor iluminación y enfoque, ' +
      'asegurando que la hoja ocupe al menos el 70% del encuadre.',
  },
]

// ── HELPERS INTERNOS ──────────────────────────────────────────────────────

/**
 * Genera un número entero aleatorio entre min y max (inclusivo)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Genera un ID de análisis único con formato DVD-YYYYMMDD-XXXX
 * Ejemplo: DVD-20250429-A7F2
 */
function generateAnalysisId() {
  const now   = new Date()
  const date  = now.toISOString().slice(0, 10).replace(/-/g, '') // "20250429"
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const suffix = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return `DVD-${date}-${suffix}`
}

// ── FUNCIÓN PRINCIPAL DE ANÁLISIS ─────────────────────────────────────────

/**
 * analyzeLeafImage — Analiza una imagen de hoja de vid con IA
 *
 * @param {File} imageFile — El archivo de imagen a analizar (objeto File del browser)
 * @returns {Promise<Object>} — Resultado del análisis en formato estándar
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INTEGRACIÓN CON MODELO REAL:
 *
 * OPCIÓN A — TensorFlow.js (modelo local en el browser):
 *   import * as tf from '@tensorflow/tfjs'
 *   // Reemplazar todo el contenido de esta función por:
 *   const model = await tf.loadLayersModel('/models/detectvid/model.json')
 *   const tensor = await preprocessImage(imageFile) // tu función de preprocesado
 *   const prediction = model.predict(tensor)
 *   const classIndex = prediction.argMax(-1).dataSync()[0]
 *   // Mapear classIndex a los DISEASE_SCENARIOS con .diseaseKey
 *
 * OPCIÓN B — FastAPI / Flask backend:
 *   // Reemplazar todo el bloque "simulación" por:
 *   const formData = new FormData()
 *   formData.append('image', imageFile)
 *   const response = await fetch('https://tu-api.com/analyze', {
 *     method: 'POST',
 *     body: formData,
 *   })
 *   const data = await response.json()
 *   return data // El backend ya devuelve el formato correcto
 *
 * OPCIÓN C — ONNX Runtime Web (modelo local .onnx):
 *   import * as ort from 'onnxruntime-web'
 *   const session = await ort.InferenceSession.create('/models/detectvid.onnx')
 *   const inputTensor = await imageToTensor(imageFile)
 *   const results = await session.run({ input: inputTensor })
 *   // Procesar results.output para obtener la clase y confianza
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function analyzeLeafImage(imageFile) {

  // ── INICIO: registro del tiempo para medir duración real ──────────────
  const startTime = Date.now()

  // ── SIMULACIÓN: demora realista de procesamiento ──────────────────────
  // Un modelo real puede tardar entre 1 y 5 segundos según el dispositivo.
  // Randomizamos para que no parezca instantáneo.
  const delay = randomInt(2500, 4200)
  await new Promise(resolve => setTimeout(resolve, delay))

  // ── SIMULACIÓN: selección aleatoria de resultado ──────────────────────
  // El modelo real calcularía probabilidades para cada clase.
  // Aquí simplemente elegimos uno de los escenarios al azar.

  // 10% de probabilidad de resultado no concluyente (índice 3)
  const isInconclusive = Math.random() < 0.10
  const scenarioIndex = isInconclusive
    ? 3
    : randomInt(0, 2) // Oídio (0), Peronóspora (1), Hoja Sana (2)

  const scenario = DISEASE_SCENARIOS[scenarioIndex]

  // Genera confianza dentro del rango del escenario
  const confidence = randomInt(...scenario.confidenceRange)

  // Genera área afectada estimada
  const affectedArea = randomInt(...scenario.affectedAreaRange)

  // ── CONSTRUCCIÓN DEL RESULTADO ────────────────────────────────────────
  // Este objeto tiene el MISMO formato que devolvería una API real.
  // Si conectás un backend, asegurate que responda con esta estructura.
  const processingTime = Date.now() - startTime

  return {
    success:        true,
    analysisId:     generateAnalysisId(),
    timestamp:      new Date().toISOString(),
    processingTime,                           // milisegundos que tardó

    // Metadata de la imagen analizada
    image: {
      name:       imageFile.name,
      size:       imageFile.size,             // bytes
      type:       imageFile.type,
      dimensions: 'No disponible en mock',    // el modelo real lo detectaría
      quality:    confidence > 70 ? 'good' : 'low',
    },

    // ← AQUÍ VA EL RESULTADO PRINCIPAL DEL MODELO
    result: {
      disease:       scenario.disease,        // Nombre legible para el usuario
      diseaseKey:    scenario.diseaseKey,     // Clave para lógica interna / i18n
      status:        scenario.status,         // "Enferma" | "Sana" | "No concluyente"
      confidence,                             // 0-100 (porcentaje de certeza del modelo)
      riskLevel:     scenario.riskLevel,      // "Alto" | "Medio" | "Bajo" | "Sin riesgo"
      riskColor:     scenario.riskColor,      // "red" | "yellow" | "green" | "gray"
      affectedArea:  `~${affectedArea}%`,     // Área de la hoja afectada (estimado)
      urgency:       scenario.urgency,        // Qué tan urgente es actuar
      symptoms:      scenario.symptoms,       // Lista de síntomas observados
      recommendation: scenario.recommendation, // Texto de recomendación
    },

    // Información del modelo que realizó el análisis
    // Cuando conectes el modelo real, actualizá estos valores
    model: {
      name:    'DetectVID-Mock-v1',
      version: '1.0.0',
      type:    'mock',    // Cambiar a 'local' o 'cloud' con el modelo real
      // Nota: el modelo real podría devolver también 'architecture', 'accuracy', etc.
    },
  }
}

// Exportación nombrada de los escenarios (útil para testing)
export { DISEASE_SCENARIOS }

// ── INTEGRACIÓN CON MODELO REAL ───────────────────────────────────────────
//
// Cuando tengas el modelo real entrenado, este bloque te permite conectarlo
// sin tocar nada más. Seguí estos 3 pasos:
//
//   PASO 1: Definí CLASS_MAP con las clases exactas que usa tu modelo.
//           La clave debe coincidir con el índice o nombre que devuelve el modelo.
//
//   PASO 2: Usá buildResultFromClassification() para construir el resultado
//           a partir de la predicción del modelo.
//
//   PASO 3: Reemplazá el bloque de simulación en analyzeLeafImage() por
//           la llamada a tu modelo + buildResultFromClassification().
//
// ─────────────────────────────────────────────────────────────────────────

/**
 * CLASS_MAP — Mapeo entre índice/clave de clase y escenario de resultado.
 *
 * Cuando el modelo devuelve un índice de clase (ej: 0, 1, 2...),
 * usás este mapa para obtener el escenario correspondiente.
 *
 * Ajustá las claves ('powdery_mildew', 'downy_mildew', etc.) para que
 * coincidan exactamente con los nombres de clase que usaste al entrenar el modelo.
 *
 * Ejemplo de uso:
 *   const classKey = 'powdery_mildew'  // lo que devuelve tu modelo
 *   const scenario = CLASS_MAP[classKey]
 */
export const CLASS_MAP = {
  powdery_mildew: DISEASE_SCENARIOS[0],  // Oídio
  downy_mildew:   DISEASE_SCENARIOS[1],  // Peronóspora
  healthy:        DISEASE_SCENARIOS[2],  // Hoja Sana
  inconclusive:   DISEASE_SCENARIOS[3],  // No concluyente

  // Si tu modelo usa índices numéricos en vez de strings:
  0: DISEASE_SCENARIOS[0],  // Oídio
  1: DISEASE_SCENARIOS[1],  // Peronóspora
  2: DISEASE_SCENARIOS[2],  // Hoja Sana
  3: DISEASE_SCENARIOS[3],  // No concluyente (fallback)
}

/**
 * buildResultFromClassification — Construye el objeto de resultado estándar
 * a partir de la salida de un modelo de clasificación real.
 *
 * @param {string|number} classKey   — Clase predicha (índice o string de CLASS_MAP)
 * @param {number}        confidence — Confianza del modelo (0–100)
 * @param {File}          imageFile  — El archivo de imagen analizado
 * @param {number}        processingTime — Tiempo de procesamiento en ms
 * @returns {Object} — Resultado en el mismo formato que analyzeLeafImage()
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EJEMPLO DE USO CON FASTAPI:
 *
 *   // En analyzeLeafImage(), reemplazá la simulación por:
 *   const formData = new FormData()
 *   formData.append('image', imageFile)
 *   const response = await fetch('https://tu-api.com/predict', {
 *     method: 'POST', body: formData
 *   })
 *   const { predicted_class, confidence } = await response.json()
 *   // predicted_class puede ser 'powdery_mildew', 0, etc. según tu modelo
 *   return buildResultFromClassification(predicted_class, confidence * 100, imageFile, Date.now() - startTime)
 *
 * EJEMPLO DE USO CON TENSORFLOW.JS:
 *
 *   // En analyzeLeafImage(), reemplazá la simulación por:
 *   const model = await tf.loadLayersModel('/models/detectvid/model.json')
 *   const tensor = await preprocessImageForModel(imageFile) // tu función
 *   const predictions = model.predict(tensor)
 *   const classIndex = predictions.argMax(-1).dataSync()[0]
 *   const confidence = predictions.max().dataSync()[0] * 100
 *   return buildResultFromClassification(classIndex, confidence, imageFile, Date.now() - startTime)
 * ─────────────────────────────────────────────────────────────────────────
 */
export function buildResultFromClassification(classKey, confidence, imageFile, processingTime) {
  // Buscamos el escenario en CLASS_MAP; si no existe, usamos "inconclusive"
  const scenario = CLASS_MAP[classKey] ?? CLASS_MAP['inconclusive']

  // Calculamos área afectada dentro del rango del escenario
  const affectedArea = randomInt(...scenario.affectedAreaRange)

  return {
    success:        true,
    analysisId:     generateAnalysisId(),
    timestamp:      new Date().toISOString(),
    processingTime,

    image: {
      name:       imageFile.name,
      size:       imageFile.size,
      type:       imageFile.type,
      dimensions: 'N/A',
      quality:    confidence > 70 ? 'good' : 'low',
    },

    result: {
      disease:        scenario.disease,
      diseaseKey:     scenario.diseaseKey,
      status:         scenario.status,
      confidence:     Math.round(confidence),   // aseguramos entero
      riskLevel:      scenario.riskLevel,
      riskColor:      scenario.riskColor,
      affectedArea:   `~${affectedArea}%`,
      urgency:        scenario.urgency,
      symptoms:       scenario.symptoms,        // síntomas hardcodeados por clase
      recommendation: scenario.recommendation,
    },

    model: {
      name:    'DetectVID-v1',
      version: '1.0.0',
      type:    'real',  // 'local' | 'cloud' | 'real'
    },
  }
}
