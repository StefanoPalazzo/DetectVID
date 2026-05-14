# 🍇 DetectVID — Sistema de Detección Inteligente de Enfermedades en Vid

> Proyecto de Tesis | Universidad de Mendoza | Stefano Palazzo | 2026

---

## 🌿 ¿Qué es DetectVID?

DetectVID es una aplicación de **agricultura de precisión** que permite detectar enfermedades en plantas de vid mediante inteligencia artificial. El usuario sube una fotografía de una hoja y el sistema devuelve un diagnóstico con nivel de confianza, riesgo y recomendación agronómica.

**Enfermedades detectables (v1.0 Mock → modelo real en desarrollo):**
- 🔴 Oídio (*Uncinula necator*)
- 🔴 Peronóspora (*Plasmopara viticola*)
- 🟡 Podredumbre Gris / Botrytis (*Botrytis cinerea*)
- 🟢 Hoja Sana
- ⚫ No concluyente

---

## 🚀 Inicio rápido

```bash
# 1. Clonar / entrar al directorio
cd DetectVID

# 2. Instalar dependencias
npm install

# 3. Iniciar servidor de desarrollo
npm run dev
```

Abrí http://localhost:5173 en el browser.

---

## 📦 Stack tecnológico

| Herramienta        | Versión  | Propósito                              |
|--------------------|----------|----------------------------------------|
| React              | 18.x     | UI declarativa basada en componentes   |
| Vite               | 5.x      | Bundler ultrarrápido + dev server      |
| Tailwind CSS       | 3.x      | Estilos utilitarios                    |
| React Router DOM   | 6.x      | Navegación SPA (Single Page App)       |
| Framer Motion      | 11.x     | Animaciones declarativas               |
| Lucide React       | 0.344.x  | Íconos SVG                             |
| clsx               | 2.x      | Composición condicional de clases CSS  |

---

## 🗂 Estructura del proyecto

```
src/
├── components/
│   ├── layout/
│   │   ├── MainLayout.jsx    ← Estructura principal: sidebar + header + content + footer
│   │   ├── Sidebar.jsx       ← Navegación lateral con NavLinks
│   │   ├── Header.jsx        ← Barra superior con título de página
│   │   └── Footer.jsx        ← Pie académico
│   └── analysis/
│       ├── UploadZone.jsx    ← Drag & drop de imágenes
│       ├── ImagePreview.jsx  ← Preview + metadata del archivo
│       ├── AnalysisLoader.jsx ← Animación de procesamiento IA
│       └── ResultsCard.jsx   ← Tarjeta de resultados completa
├── context/
│   └── AnalysisContext.jsx   ← Estado global con Context API + useReducer
├── pages/
│   ├── Home.jsx              ← Página de inicio
│   ├── Analyze.jsx           ← MVP principal (flujo completo)
│   ├── History.jsx           ← Historial (placeholder v2.0)
│   ├── Dashboard.jsx         ← Dashboard analítico (placeholder v2.0)
│   ├── VineyardMap.jsx       ← Mapa GPS (placeholder v3.0)
│   └── Settings.jsx          ← Configuración
├── services/
│   └── mockAnalysis.js       ← ⭐ Servicio mock → reemplazar con modelo real
├── utils/
│   └── validators.js         ← Validación de imágenes
├── App.jsx                   ← Router principal
├── main.jsx                  ← Punto de entrada
└── index.css                 ← Estilos globales + Tailwind
```

---

## 🧠 Cómo conectar el modelo de IA real

El archivo clave es `src/services/mockAnalysis.js`.

La función `analyzeLeafImage(imageFile)` ya tiene la firma y el formato de retorno correcto. Solo necesitás **reemplazar el cuerpo** de la función.

### Opción A — FastAPI o Flask (backend REST)

```js
// Reemplazar el contenido de analyzeLeafImage() con:
export async function analyzeLeafImage(imageFile) {
  const formData = new FormData()
  formData.append('image', imageFile)

  const response = await fetch('https://tu-api.com/api/v1/analyze', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Error del servidor: ${response.status}`)
  }

  return await response.json() // El backend debe retornar el mismo formato de objeto
}
```

Tu backend Python (FastAPI):
```python
@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    img = preprocess(await image.read())
    prediction = model.predict(img)
    return {
        "success": True,
        "result": { "disease": ..., "confidence": ..., ... }
    }
```

### Opción B — TensorFlow.js (modelo local en el browser)

```js
import * as tf from '@tensorflow/tfjs'

let model = null

export async function analyzeLeafImage(imageFile) {
  // Carga el modelo una sola vez
  if (!model) {
    model = await tf.loadLayersModel('/models/detectvid/model.json')
  }

  // Preprocesado: imagen → tensor 224x224x3
  const img = await createImageBitmap(imageFile)
  const tensor = tf.browser.fromPixels(img)
    .resizeNearestNeighbor([224, 224])
    .toFloat()
    .div(255.0)
    .expandDims(0)

  // Inferencia
  const predictions = model.predict(tensor)
  const classIndex = predictions.argMax(-1).dataSync()[0]
  const confidence = Math.round(predictions.max().dataSync()[0] * 100)

  tensor.dispose()
  predictions.dispose()

  // Mapear classIndex a DISEASE_SCENARIOS[classIndex]
  return buildResult(classIndex, confidence, imageFile)
}
```

### Opción C — ONNX Runtime Web

```js
import * as ort from 'onnxruntime-web'

export async function analyzeLeafImage(imageFile) {
  const session = await ort.InferenceSession.create('/models/detectvid.onnx')
  const inputTensor = await preprocessToOnnxTensor(imageFile) // tu función de preprocesado
  const { output } = await session.run({ input: inputTensor })
  const classIndex = output.data.indexOf(Math.max(...output.data))
  return buildResult(classIndex, Math.round(output.data[classIndex] * 100), imageFile)
}
```

---

## 🗺 Roadmap del producto

| Fase | Estado    | Contenido                                                           |
|------|-----------|---------------------------------------------------------------------|
| v1.0 | ✅ Activo  | Upload, validación, análisis mock, resultados completos             |
| v2.0 | 🔜 Próximo | Historial, dashboard analítico, exportación PDF, auth de usuarios   |
| v3.0 | 📋 Planificado | Mapa GPS, heatmaps, modo offline, app móvil, captura con drones  |

---

## 📱 Migración a aplicación móvil

La arquitectura está preparada para migrar a React Native:

1. **Reemplazar `react-router-dom`** por React Navigation
2. **Reemplazar `useDropzone`/input file** por `react-native-image-picker`
3. **Mover `analyzeLeafImage()`** sin cambios (misma lógica de fetch)
4. **Tailwind** → `nativewind` o `StyleSheet`
5. El `AnalysisContext` funciona **igual** en React Native

---

## 🎓 Información académica

| Campo         | Valor                         |
|---------------|-------------------------------|
| Proyecto      | DetectVID                     |
| Institución   | Universidad de Mendoza        |
| Autor         | Stefano Palazzo               |
| Año           | 2026                          |
| Tipo          | Proyecto de Tesis Final       |

---

## 📝 Comandos útiles

```bash
npm run dev      # Servidor de desarrollo (http://localhost:5173)
npm run build    # Build de producción (genera /dist)
npm run preview  # Preview del build de producción
```
