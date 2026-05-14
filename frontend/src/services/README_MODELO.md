# Cómo conectar el modelo real a DetectVID

> Este documento es para el momento en que tengas un modelo de IA entrenado
> y quieras reemplazar la simulación actual por predicciones reales.

---

## Arquitectura actual (mock)

```
Usuario sube imagen
       ↓
analyzeLeafImage(imageFile)   ← src/services/mockAnalysis.js
       ↓
setTimeout (simulación 2.5–4s)
       ↓
Selección aleatoria de escenario
       ↓
Resultado formateado → UI
```

## Arquitectura con modelo real

```
Usuario sube imagen
       ↓
analyzeLeafImage(imageFile)   ← src/services/mockAnalysis.js (modificado)
       ↓
[TensorFlow.js | FastAPI | ONNX]  ← tu modelo aquí
       ↓
predicted_class + confidence
       ↓
buildResultFromClassification()   ← ya implementado
       ↓
Resultado formateado → UI (sin cambios en la UI)
```

---

## Opción A — FastAPI (recomendado para tesis)

Es la opción más limpia para una tesis: el modelo corre en Python (donde está
el ecosistema de ML) y el frontend lo consume via HTTP.

### Backend Python (FastAPI)

```python
# main.py
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import tensorflow as tf
import numpy as np
from PIL import Image
import io

app = FastAPI()

# Permitir requests desde el frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # URL de Vite en desarrollo
    allow_methods=["POST"],
    allow_headers=["*"],
)

# Cargamos el modelo UNA VEZ al iniciar el servidor
MODEL = tf.keras.models.load_model("detectvid_model.h5")

# Clases en el MISMO ORDEN que usaste al entrenar
CLASS_NAMES = ["powdery_mildew", "downy_mildew", "healthy", "gray_mold"]

def preprocess(image_bytes: bytes) -> np.ndarray:
    """Preprocesa la imagen igual que en el entrenamiento."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((224, 224))  # ajustá al tamaño que usaste
    arr = np.array(img) / 255.0
    return np.expand_dims(arr, axis=0)

@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    image_bytes = await image.read()
    tensor = preprocess(image_bytes)
    
    predictions = MODEL.predict(tensor)[0]  # shape: (n_classes,)
    class_index = int(np.argmax(predictions))
    confidence = float(predictions[class_index])
    
    return {
        "predicted_class": CLASS_NAMES[class_index],
        "confidence": confidence,  # 0.0 a 1.0
        "all_probs": {
            name: float(prob)
            for name, prob in zip(CLASS_NAMES, predictions)
        }
    }
```

```bash
# Correr el backend
pip install fastapi uvicorn tensorflow pillow python-multipart
uvicorn main:app --reload --port 8000
```

### Frontend (modificación en mockAnalysis.js)

En `analyzeLeafImage()`, reemplazá el bloque de simulación por:

```javascript
// REEMPLAZAR ESTO:
// const delay = randomInt(2500, 4200)
// await new Promise(resolve => setTimeout(resolve, delay))
// const isInconclusive = Math.random() < 0.10
// const scenarioIndex = isInconclusive ? 4 : randomInt(0, 3)
// const scenario = DISEASE_SCENARIOS[scenarioIndex]

// POR ESTO:
const formData = new FormData()
formData.append('image', imageFile)

const response = await fetch('http://localhost:8000/predict', {
  method: 'POST',
  body: formData,
})

if (!response.ok) {
  throw new Error(`Error del servidor: ${response.status}`)
}

const { predicted_class, confidence } = await response.json()

// buildResultFromClassification ya está exportado en este mismo archivo
return buildResultFromClassification(
  predicted_class,
  confidence * 100,  // convertimos de 0–1 a 0–100
  imageFile,
  Date.now() - startTime
)
```

---

## Opción B — TensorFlow.js (modelo local en el browser)

El modelo corre directamente en el browser del usuario. Sin servidor, sin conexión a internet.
Es más complejo de implementar pero ideal para demostración offline.

### Requisitos

```bash
npm install @tensorflow/tfjs
```

El modelo debe estar en formato TensorFlow.js. Convertilo desde Keras/SavedModel:

```bash
pip install tensorflowjs
tensorflowjs_converter \
  --input_format=keras \
  detectvid_model.h5 \
  public/models/detectvid/
```

Esto genera `public/models/detectvid/model.json` + archivos de pesos `.bin`.

### Integración en mockAnalysis.js

```javascript
import * as tf from '@tensorflow/tfjs'

// Cargamos el modelo una vez y lo cacheamos
let _model = null
async function getModel() {
  if (!_model) {
    _model = await tf.loadLayersModel('/models/detectvid/model.json')
  }
  return _model
}

// Función de preprocesado (ajustá al tamaño que usaste en entrenamiento)
async function preprocessImageForModel(imageFile) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 224   // ajustá
      canvas.height = 224  // ajustá
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, 224, 224)
      
      const tensor = tf.browser
        .fromPixels(canvas)
        .toFloat()
        .div(255.0)         // normalización [0, 1]
        .expandDims(0)      // agrega batch dimension: [1, 224, 224, 3]
      
      resolve(tensor)
    }
    img.src = URL.createObjectURL(imageFile)
  })
}

// En analyzeLeafImage(), reemplazá la simulación por:
const model = await getModel()
const tensor = await preprocessImageForModel(imageFile)
const predictions = model.predict(tensor)
const probs = await predictions.data()
const classIndex = predictions.argMax(-1).dataSync()[0]
const confidence = probs[classIndex] * 100

tensor.dispose()
predictions.dispose()

return buildResultFromClassification(classIndex, confidence, imageFile, Date.now() - startTime)
```

---

## Opción C — ONNX Runtime Web

Para modelos exportados en formato `.onnx` (PyTorch, scikit-learn, etc.).

```bash
npm install onnxruntime-web
```

```javascript
import * as ort from 'onnxruntime-web'

// En analyzeLeafImage():
const session = await ort.InferenceSession.create('/models/detectvid.onnx')

// Preprocesar imagen → Float32Array de shape [1, 3, 224, 224] (NCHW)
const inputData = await preprocessImageToNCHW(imageFile, 224, 224)
const inputTensor = new ort.Tensor('float32', inputData, [1, 3, 224, 224])

const results = await session.run({ input: inputTensor })
const outputData = results.output.data  // probabilidades
const classIndex = Array.from(outputData).indexOf(Math.max(...outputData))
const confidence = outputData[classIndex] * 100

return buildResultFromClassification(classIndex, confidence, imageFile, Date.now() - startTime)
```

---

## CLASS_MAP — Claves de clase

El archivo `mockAnalysis.js` ya exporta `CLASS_MAP`. Asegurate de que las claves
coincidan **exactamente** con los nombres/índices que usa tu modelo:

| Clave string      | Índice | Enfermedad              |
|-------------------|--------|-------------------------|
| `powdery_mildew`  | 0      | Oídio                   |
| `downy_mildew`    | 1      | Peronóspora             |
| `healthy`         | 2      | Hoja Sana               |
| `inconclusive`    | 3      | No concluyente (fallback) |

Si entrenaste con nombres distintos, modificá `CLASS_MAP` en `mockAnalysis.js`.

---

## Síntomas hardcodeados — ¿por qué?

Los síntomas y recomendaciones no los predice el modelo — están hardcodeados
en `DISEASE_SCENARIOS` por clase. Esto es intencional:

- Los síntomas son conocimiento agronómico fijo, no algo que el modelo infiere de la imagen
- El modelo predice la CLASE (qué enfermedad es), no los síntomas
- Hardcodearlos garantiza textos correctos y consistentes en la UI

Si en el futuro el modelo real también devuelve síntomas (ej: multilabel classification),
podés mergear los síntomas del modelo con los de `DISEASE_SCENARIOS`.

---

## Estructura del resultado esperado

```javascript
{
  success: true,
  analysisId: "DVD-20250429-A7F2",
  timestamp: "2025-04-29T14:30:00.000Z",
  processingTime: 1240,  // ms

  image: {
    name: "hoja_sector_b.jpg",
    size: 234567,
    type: "image/jpeg",
    dimensions: "N/A",
    quality: "good"
  },

  result: {
    disease: "Oídio",
    diseaseKey: "powdery_mildew",
    status: "Enferma",
    confidence: 91,        // 0-100
    riskLevel: "Alto",
    riskColor: "red",      // "red" | "yellow" | "green" | "gray"
    affectedArea: "~35%",
    urgency: "Inmediata",
    symptoms: [...],
    recommendation: "..."
  },

  model: {
    name: "DetectVID-v1",
    version: "1.0.0",
    type: "real"
  }
}
```

---

*Cualquier duda sobre la integración, revisá los comentarios en `mockAnalysis.js`.*
