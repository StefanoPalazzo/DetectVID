# DetectVID — Historia, Decisiones y Proceso

> Documento de contexto del proyecto. Explica por qué existe DetectVID, qué problemas
> resuelve, qué decisiones se tomaron en cada etapa y cómo se llegó al sistema final.

---

## Índice

1. [El problema real](#1-el-problema-real)
2. [La solución — qué hace DetectVID](#2-la-solución--qué-hace-detectvid)
3. [Decisión 1 — Qué enfermedades detectar](#3-decisión-1--qué-enfermedades-detectar)
4. [Decisión 2 — Dónde corre el modelo: nube vs. local](#4-decisión-2--dónde-corre-el-modelo-nube-vs-local)
5. [Decisión 3 — Cómo se consiguieron los datos](#5-decisión-3--cómo-se-consiguieron-los-datos)
6. [Decisión 4 — Data augmentation](#6-decisión-4--data-augmentation)
7. [El diseño experimental](#7-el-diseño-experimental)
8. [Fase 1 — Dataset mixto (laboratorio + campo)](#8-fase-1--dataset-mixto-laboratorio--campo)
9. [Fase 2 — Dataset limpio (solo campo)](#9-fase-2--dataset-limpio-solo-campo)
10. [Resultados comparados](#10-resultados-comparados)
11. [El modelo elegido](#11-el-modelo-elegido)
12. [Lecciones aprendidas](#12-lecciones-aprendidas)

---

## 1. El problema real

Mi hermano es ingeniero agrónomo en una bodega grande de Mendoza.

Me contó que el trabajo de detección temprana de enfermedades en viñedos funciona así:

```
1. El agrónomo recorre manualmente las zonas más sensibles o propensas a enfermedades
2. Inspecciona hoja por hoja de forma visual
3. Si sospecha un problema, se coordinan fumigaciones preventivas
4. Las fumigaciones preventivas llenan de agroquímicos y pesticidas el medioambiente
   — aunque muchas veces no haya enfermedad confirmada
5. Eso genera costos innecesarios para la empresa y daño ambiental evitable
```

El problema tiene tres dimensiones:

| Dimensión | Problema concreto |
|-----------|------------------|
| **Tiempo** | La inspección manual es lenta. Cuando se detecta visualmente, la enfermedad ya avanzó |
| **Costo** | Las fumigaciones preventivas son caras. Se aplican aunque no sean necesarias |
| **Escala** | Un agrónomo no puede cubrir todos los sectores de un viñedo grande con la misma frecuencia |

**La hipótesis central de DetectVID:**
> Si el agrónomo puede sacarle una foto a una hoja con el celular y obtener un diagnóstico inmediato con alto grado de certeza, puede detectar enfermedades antes, fumigar solo donde hace falta, y tomar decisiones basadas en datos en lugar de experiencia visual subjetiva. Además puede delegarlo en personas no capacitadas, para poder evaluar luego los resultados de un área mayor.

---

## 2. La solución — qué hace DetectVID

DetectVID es una aplicación web de agricultura de precisión que:

1. Recibe una fotografía de una hoja de vid
2. La procesa con un modelo de deep learning entrenado específicamente para enfermedades de vid
3. Devuelve un diagnóstico: qué enfermedad hay (si hay alguna), con qué nivel de confianza, qué riesgo representa, y qué hacer

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Agrónomo en campo                                              │
│   → saca foto con el celular                                     │
│   → la app detecta GPS automáticamente desde el EXIF             │
│                                                                  │
│            ↓  (cuando hay internet)                              │
│                                                                  │
│   Modelo en la nube                                              │
│   → clasifica la hoja en < 2 segundos                            │
│   → devuelve: enfermedad + confianza + riesgo + recomendación    │
│                                                                  │
│            ↓                                                     │
│                                                                  │
│   El agrónomo genera un reporte de zonas afectadas               │
│   → toma decisiones de fumigación precisas y localizadas         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**El objetivo no es reemplazar al agrónomo.** Es darle una herramienta que amplía su capacidad de cobertura y le da evidencia concreta para tomar mejores decisiones.

---

## 3. Decisión 1 — Qué enfermedades detectar

### El proceso

Lo primero fue definir el alcance: no se pueden detectar todas las enfermedades de vid en v1.0. Hay decenas. Era necesario priorizar.

Investigué las enfermedades más comunes, más costosas y más frecuentes en viñedos de Argentina (y el mundo). Los criterios fueron:

- **Prevalencia**: ¿cuán común es en Mendoza y en otras regiones vitivinícolas?
- **Impacto económico**: ¿cuánto daño genera si no se detecta a tiempo?
- **Disponibilidad de datos**: ¿existe un dataset público confiable con imágenes de esa enfermedad?
- **Distinguibilidad visual**: ¿tiene síntomas visuales claros que un modelo puede aprender?

### Las enfermedades elegidas para v1.0

#### 🔵 Peronóspora — *Plasmopara viticola*

- Una de las enfermedades más destructivas de la vid a nivel mundial
- Causa manchas amarillo-aceite en el haz y un micelio blanco harinoso en el envés
- Avanza muy rápido en condiciones húmedas
- Puede destruir el 80–100% de una cosecha si no se trata a tiempo
- Alta disponibilidad de imágenes en datasets públicos

#### 🟡 Oídio — *Erysiphe necator*

- Afecta tanto hojas como racimos (puede contaminar la vendimia directamente)
- Síntoma característico: polvo blanco grisáceo en la superficie de la hoja
- Muy frecuente en climas secos y cálidos (exactamente Mendoza)
- El daño en la uva puede afectar la calidad del vino final
- También bien representado en datasets

#### 🟢 Sana — `healthy`

- Clase de referencia: una hoja sin signos de enfermedad
- Fundamental para que el modelo aprenda la diferencia, no solo las enfermedades

#### ⚫ Otras — `others` *(solo en modelos de 4 clases)*

- Incluye: Black Rot (*Guignardia bidwellii*), Podredumbre Gris (*Botrytis cinerea*), ESCA, entre otras
- No son el foco de la herramienta, pero **deben existir como clase** para que el modelo no confunda una hoja con Black Rot con una hoja con peronóspora
- Sin esta clase, el modelo estaría obligado a clasificar cualquier hoja enferma en solo tres categorías, forzando errores en enfermedades que no reconoce

### Enfermedades descartadas para v1.0

| Enfermedad | Razón del descarte |
|------------|--------------------|
| Black Rot | Incluida en `others`. Insuficientes imágenes de campo para ser clase propia |
| Botrytis / Podredumbre Gris | Idem. Sus síntomas cambian mucho según el estado de avance |
| ESCA | Muy difícil de distinguir visualmente en etapas tempranas; imágenes escasas |
| Flavescencia Dorada | Enfermedad sistémica — no tiene síntomas foliares consistentes en imágenes |

---

## 4. Decisión 2 — Dónde corre el modelo: nube vs. local

### El contexto

Los viñedos en Argentina (y en muchas regiones vitivinícolas del mundo) tienen una característica importante: **la conectividad es intermitente o inexistente en el campo**. Una finca puede tener internet en la bodega, pero no señal en el extremo del viñedo.

Esto plantea una pregunta de arquitectura fundamental:

> ¿El modelo corre en el dispositivo del usuario (offline-first) o en la nube (requiere internet)?

### Alternativas consideradas

| Opción | Ventajas | Desventajas |
|--------|----------|-------------|
| **Modelo en la nube** | Mayor potencia de cómputo, modelo más grande, fácil de actualizar | Requiere internet para clasificar |
| **Modelo en el dispositivo (TFLite, ONNX)** | Funciona offline, respuesta instantánea | Requiere un dispositivo potente, modelo más chico y menos preciso |
| **Híbrido: fotos offline, clasificación online** | No requiere internet en el momento de la foto | Requiere internet para obtener el resultado |

### La decisión y el razonamiento

Se eligió el modelo **en la nube**, con un flujo de trabajo **asíncrono**:

```
Campo (sin internet)          Bodega o zona con internet
       │                               │
       │  El usuario saca fotos        │
       │  Las fotos quedan guardadas   │
       │  con GPS en la app            │
       │                               │
       │  ──── al conseguir internet ──▶
       │                               │
       │                   Las fotos se suben automáticamente
       │                   El modelo las clasifica
       │                   Los resultados aparecen en el historial
```

**¿Por qué no correr el modelo en el dispositivo?**

1. **El hardware no es uniforme.** No todos los productores tienen un iPhone 15 o un flagship Android. Un modelo EfficientNet en un dispositivo de gama media puede tardar 5–15 segundos por imagen, lo que hace la herramienta inutilizable en campo.

2. **La actualización del modelo es compleja.** Si el modelo mejora (más datos, mejor entrenamiento), hay que hacer que cada usuario actualice la app. En la nube, se reemplaza el checkpoint y todos los usuarios tienen el modelo nuevo automáticamente.

3. **El modelo en la nube puede ser más grande y preciso.** Los modelos de dispositivo requieren cuantización y simplificación que sacrifican precisión. En nube no hay esas restricciones.

4. **El flujo de trabajo real lo permite.** El agrónomo no necesita el resultado en 2 segundos mientras está en campo. Puede sacar 50 fotos, volver a la bodega, y tener los resultados esperando.

---

## 5. Decisión 3 — Cómo se consiguieron los datos

### Fuentes utilizadas

Los datos se obtuvieron de múltiples fuentes públicas y confiables:

| Fuente | Tipo de imágenes | Características |
|--------|-----------------|-----------------|
| **PlantVillage** | Laboratorio | Hojas individuales sobre fondo blanco o negro, iluminación controlada, condiciones perfectas |
| **Zenodo (datasets específicos de vid)** | Campo + laboratorio | Mix de condiciones reales y controladas, mayor variedad de ángulos y lighting |
| **Otros repositorios académicos** | Campo | Imágenes de campo reales, tomadas con cámaras de distintas calidades |

### El problema del desbalance

Al juntar todas las fuentes, la distribución resultante fue muy despareja:

```
others      ████████████████████████████████  ~4.650 imágenes  (49%)
healthy     ██████████████████████████        ~2.600 imágenes  (27%)
peronospora █████████████                     ~1.260 imágenes  (13%)
oidio       █████                               ~630 imágenes   (6%)
```

**Por qué el desbalance es un problema crítico:**

> Si el modelo ve 7 veces más imágenes de `others` que de `oidio`, aprende que "apostar siempre a others" le da buen accuracy sin aprender nada útil. Puede llegar a 70% de accuracy sin haber aprendido a detectar oídio en absoluto.

El recall de las clases que importan (oidio y peronospora) puede ser cercano a cero aunque el accuracy sea alto. Por eso el accuracy no es la métrica principal — el **F1-macro** y el **recall por clase** son los indicadores que importan.

### Estrategia de datos

Se probaron dos enfoques para corregir el desbalance (ver sección de experimentos):

- **Weighted Loss** — entrenar con todos los datos, pero penalizar más los errores en clases chicas
- **Undersampling** — recortar las clases grandes para que todas tengan el mismo volumen que la más chica

---

## 6. Decisión 4 — Data augmentation

### El problema que resuelve

Las imágenes de laboratorio son perfectas: fondo plano, hoja centrada, iluminación uniforme. Las imágenes de campo son caóticas: la hoja puede estar tapada parcialmente, el sol puede generar sobreexposición, la cámara puede ser un celular de gama baja, el viento puede haber movido la planta.

Si el modelo solo ve imágenes perfectas, aprende atajos (*shortcut learning*): puede estar clasificando por el fondo blanco del laboratorio, no por los síntomas de la enfermedad. Cuando le llega una imagen de campo, falla.

**El augmentation simula las condiciones del mundo real durante el entrenamiento.**

### Transformaciones aplicadas

```python
# Variación geométrica — la hoja puede estar en cualquier orientación
RandomHorizontalFlip(p=0.5)      # La hoja no tiene "lado correcto"
RandomVerticalFlip(p=0.3)        # Fotos tomadas desde distintos ángulos
RandomRotation(degrees=20)       # El fotógrafo no siempre encuadra perfecto

# Variación de escala — el fotógrafo no siempre está a la misma distancia
RandomResizedCrop(size=224,
  scale=(0.7, 1.0))              # Zoom variable: desde 70% hasta el 100% de la hoja

# Variación de color e iluminación — condiciones climáticas y de luz
ColorJitter(
  brightness=0.2,                # Sol directo vs. día nublado
  contrast=0.2,                  # Contraste variable por la cámara
  saturation=0.1,                # Saturación del color
  hue=0.03                       # Variación mínima de tono (mantiene los colores diagnósticos)
)

# Oclusiones — la mano del usuario, otras hojas, ramas
RandomErasing(p=0.1,
  scale=(0.02, 0.1))             # Simula que algo tapa parte de la hoja
```

### Por qué ciertos augmentations NO se aplicaron

| Augmentation descartado | Razón |
|------------------------|-------|
| **Grayscale** | El color es una feature diagnóstica: oídio → blanco, peronospora → amarillo-marrón. Convertir a escala de grises destruye información clave |
| **GaussianBlur agresivo** | La textura del polvo blanco del oídio es una feature visual importante. Blur excesivo la elimina |
| **CutMix / MixUp** | Mezclar imágenes de hojas enfermas con hojas sanas crearía ejemplos ambiguos que el modelo no puede aprender bien |
| **Rotación > 20°** | Más de 20° genera imágenes poco realistas — nadie saca una foto de una hoja girada 90° |
| **Hue agresivo (> 0.05)** | Una variación de tono grande puede transformar el amarillo de peronospora en verde, eliminando el síntoma visual |

---

## 7. El diseño experimental

### El objetivo

No basta con entrenar un modelo y medir accuracy. Las preguntas reales son:

1. ¿Qué **arquitectura** funciona mejor para este problema?
2. ¿Es mejor detectar **3 clases** (sana, oídio, peronóspora) o **4 clases** (+ otras)?
3. ¿**Weighted loss** o **undersampling** para manejar el desbalance?
4. ¿Los modelos entrenados con imágenes de laboratorio generalizan bien a imágenes de campo?

Para responder estas preguntas de forma sistemática, se diseñó una **grilla de experimentos** con tres ejes:

```
       Eje 1: Arquitectura
       EfficientNet-B0 / ResNet18 / ResNet50 / MobileNet-V3
              │
              ▼
       Eje 2: Número de clases
       3 clases (sana / oídio / peronospora)
       4 clases (+ otras)
              │
              ▼
       Eje 3: Estrategia de balanceo
       Weighted Loss / Undersampling
```

### Las dos fases

Para detectar si el modelo estaba haciendo trampa aprendiendo atajos de laboratorio, los experimentos se dividieron en dos fases con **exactamente el mismo diseño**:

```
┌─────────────────────────────────────────────────────────┐
│  FASE 1 — Dataset mixto                                 │
│  Incluye imágenes de laboratorio + imágenes de campo    │
│  Fondos blancos/negros, iluminación perfecta            │
│  12 experimentos                                        │
└─────────────────────────────────────────────────────────┘
                         vs.
┌─────────────────────────────────────────────────────────┐
│  FASE 2 — Dataset limpio (clean)                        │
│  Solo imágenes de campo                                 │
│  Condiciones reales, variables, sin fondos planos       │
│  12 experimentos espejo                                 │
└─────────────────────────────────────────────────────────┘
```

**El shortcut learning** es el fenómeno donde el modelo aprende a clasificar por el fondo plano de laboratorio en lugar de por los síntomas de la hoja. Si en la Fase 1 el accuracy es alto pero en la Fase 2 cae significativamente, significa que el modelo en Fase 1 estaba haciendo trampa.

---

## 8. Fase 1 — Dataset mixto (laboratorio + campo)

### Árbol de experimentos

```
Fase 1 — Dataset mixto
│
├── 3 clases (healthy / oidio / peronospora)
│   ├── Weighted Loss
│   │   ├── exp01 — EfficientNet-B0   ← BASELINE
│   │   ├── exp02 — ResNet18
│   │   ├── exp07 — MobileNet-V3
│   │   └── exp09 — ResNet50
│   └── Undersampling
│       └── exp05 — EfficientNet-B0
│
└── 4 clases (+ others)
    ├── Weighted Loss
    │   ├── exp03 — EfficientNet-B0
    │   ├── exp04 — ResNet18
    │   ├── exp08 — MobileNet-V3
    │   └── exp10 — ResNet50
    └── Undersampling
        ├── exp06 — EfficientNet-B0
        └── exp11 — ResNet18

exp12 — Re-run del ganador con más épocas para confirmar que escala
```

### Resultados Fase 1

| Experimento | Arquitectura | Clases | Balanceo | Accuracy | F1-macro |
|-------------|-------------|--------|----------|----------|----------|
| exp01 | EfficientNet-B0 | 3 | Weighted | 99.13% | 98.97% |
| exp02 | ResNet18 | 3 | Weighted | 98.87% | 98.60% |
| exp07 | MobileNet-V3 | 3 | Weighted | 98.69% | 98.41% |
| **exp09** | **ResNet50** | **3** | **Weighted** | **99.35%** | **99.20%** |
| exp05 | EfficientNet-B0 | 3 | Undersampling | 99.08% | 98.94% |
| exp03 | EfficientNet-B0 | 4 | Weighted | 99.05% | 98.49% |
| exp04 | ResNet18 | 4 | Weighted | 98.17% | 96.71% |
| exp08 | MobileNet-V3 | 4 | Weighted | 98.18% | 97.16% |
| exp10 | ResNet50 | 4 | Weighted | 99.05% | 98.29% |
| exp06 | EfficientNet-B0 | 4 | Undersampling | 98.83% | 98.08% |
| exp11 | ResNet18 | 4 | Undersampling | 98.77% | 97.93% |
| **exp12** | **EfficientNet-B0** | **4** | **Weighted** | **99.05%** | **98.49%** |

> **Ganador Fase 1:** exp09 (ResNet50, 3 clases, Weighted) — F1-macro 99.20%

---

## 9. Fase 2 — Dataset limpio (solo campo)

Los mismos experimentos, pero entrenados y evaluados únicamente con imágenes de campo. Si un modelo aprendió el fondo de laboratorio como atajo, aquí va a colapsar.

```
Fase 2 — Dataset limpio (sufijo _clean)
│
├── 3 clases
│   ├── Weighted Loss
│   │   ├── exp13_clean — EfficientNet-B0
│   │   ├── exp14_clean — ResNet18
│   │   ├── exp15_clean — MobileNet-V3
│   │   └── exp16_clean — ResNet50
│   └── Undersampling
│       └── exp17_clean — EfficientNet-B0
│
└── 4 clases
    ├── Weighted Loss
    │   ├── exp18_clean — EfficientNet-B0
    │   ├── exp19_clean — ResNet18
    │   ├── exp20_clean — MobileNet-V3
    │   └── exp21_clean — ResNet50
    └── Undersampling
        ├── exp22_clean — EfficientNet-B0
        └── exp23_clean — ResNet18

exp24_clean — Re-run del ganador en dataset limpio
```

### Resultados Fase 2

| Experimento | Arquitectura | Clases | Balanceo | Accuracy | F1-macro |
|-------------|-------------|--------|----------|----------|----------|
| exp13_clean | EfficientNet-B0 | 3 | Weighted | 98.24% | 98.22% |
| **exp14_clean** | **ResNet18** | **3** | **Weighted** | **98.39%** | **98.35%** |
| exp15_clean | MobileNet-V3 | 3 | Weighted | 96.17% | 96.11% |
| exp16_clean | ResNet50 | 3 | Weighted | 98.24% | 98.15% |
| exp17_clean | EfficientNet-B0 | 3 | Undersampling | 97.93% | 97.88% |
| exp18_clean | EfficientNet-B0 | 4 | Weighted | 97.99% | 97.79% |
| exp19_clean | ResNet18 | 4 | Weighted | 97.64% | 97.37% |
| exp20_clean | MobileNet-V3 | 4 | Weighted | 95.67% | 95.25% |
| exp21_clean | ResNet50 | 4 | Weighted | 97.95% | 97.60% |
| exp22_clean | EfficientNet-B0 | 4 | Undersampling | 97.42% | 97.19% |
| exp23_clean | ResNet18 | 4 | Undersampling | 96.68% | 96.33% |
| **exp24_clean** | **EfficientNet-B0** | **4** | **Weighted** | **97.99%** | **97.79%** |

---

## 10. Resultados comparados

### Fase 1 vs. Fase 2 — ¿Cuánto cayó el rendimiento?

```
                    F1-macro     F1-macro     Δ caída
Arquitectura        Fase 1       Fase 2
──────────────────────────────────────────────────────
EfficientNet-B0     98.97%       98.22%       -0.75pp   ✅ Muy robusta
ResNet18            98.60%       98.35%       -0.25pp   ✅ La más estable
MobileNet-V3        98.41%       96.11%       -2.30pp   ⚠️ Cayó más
ResNet50            99.20%       98.15%       -1.05pp   ⚠️ Más sensible al cambio
```

**Insight clave:** ResNet18 y EfficientNet-B0 son las arquitecturas más robustas al cambio de distribución. ResNet50 tenía el mejor F1 en Fase 1 pero cayó más al quitar el sesgo de laboratorio — señal de que parte de su rendimiento dependía de esos atajos.

### Recall de las enfermedades críticas — Fase 2

La métrica que más importa para la aplicación real es el **recall de oídio y peronóspora**. Un falso negativo (no detectar una enfermedad que existe) es el peor error posible: el productor no fumiga, la enfermedad avanza.

```
                             Recall     Recall
Experimento                  Oídio      Peronóspora
────────────────────────────────────────────────────
exp14_clean (ResNet18, 3cls)  97.60%     98.59%     ✅ Mejor 3 clases
exp13_clean (EffNet,  3cls)   98.50%     98.19%     ✅
exp16_clean (ResNet50, 3cls)  99.10%     98.19%     ✅
exp24_clean (EffNet,  4cls)   97.60%     96.98%     ✅ Mejor 4 clases
exp18_clean (EffNet,  4cls)   97.60%     96.98%     ✅
exp20_clean (MobileNet,4cls)  97.60%     95.77%     ⚠️
```

### Weighted Loss vs. Undersampling

En todos los ejes, **Weighted Loss consistentemente superó a Undersampling**:

```
Eje 3 clases / EfficientNet-B0:
  Weighted     → F1 98.22%
  Undersampling → F1 97.88%   (-0.34pp)

Eje 4 clases / EfficientNet-B0:
  Weighted     → F1 97.79%
  Undersampling → F1 97.19%   (-0.60pp)
```

**Por qué:** Undersampling tira imágenes útiles. Con un dataset ya moderado (~10k imágenes), cada imagen cuenta. Weighted Loss usa todos los datos y le dice al modelo qué errores importan más — sin desperdiciar información.

---

## 11. El modelo elegido

### ¿Por qué EfficientNet-B0 con 4 clases y Weighted Loss?

El ganador de los experimentos puros en Fase 1 fue ResNet50 con 3 clases (F1 99.20%). Sin embargo, el modelo elegido para producción fue **EfficientNet-B0 con 4 clases y Weighted Loss** (exp12 / exp24_clean).

El razonamiento:

**1. La clase `others` es necesaria para el mundo real**

En campo, el usuario va a fotografiar hojas con Black Rot, ESCA, Botrytis. Si el modelo solo conoce 3 clases, está obligado a clasificar esas hojas como sana, oídio o peronóspora — generando falsos positivos inevitables. La clase `others` es la válvula de escape para "esto no es lo que busco, pero hay algo mal aquí".

**2. EfficientNet-B0 escala mejor en dataset limpio**

La caída de Fase 1 a Fase 2 para EfficientNet-B0 fue de solo -0.75pp en F1-macro (3 clases). Es la arquitectura más robusta al cambio de distribución, que es exactamente lo que va a ocurrir en producción: el modelo fue entrenado con ciertos datos, pero el usuario le va a mandar fotos con cualquier celular, en cualquier condición de luz.

**3. EfficientNet-B0 vs. ResNet50: la relación parámetros/rendimiento**

```
Arquitectura     Parámetros   F1 Fase 2 (3cls)   Δ vs. EfficientNet
──────────────────────────────────────────────────────────────────
EfficientNet-B0    5.3M         98.22%             —
ResNet18          11.7M         98.35%             +0.13pp   (×2.2 parámetros)
ResNet50          25.6M         98.15%             -0.07pp   (×4.8 parámetros)
MobileNet-V3       5.5M         96.11%             -2.11pp
```

ResNet50 tiene 5 veces más parámetros que EfficientNet-B0 y **rinde ligeramente peor** en el dataset limpio. No hay justificación para ese costo computacional en un sistema que tiene que responder en tiempo real.

**4. Los números finales del modelo en producción**

```
Modelo: EfficientNet-B0, 4 clases, Weighted Loss
Dataset: mixto (con imágenes de laboratorio para mayor volumen de training)
─────────────────────────────────────────────────
Accuracy test:    99.05%
F1-macro test:    98.49%

Recall por clase:
  healthy:      99.60%
  oidio:        97.21%
  peronospora:  98.91%
  others:       99.08%
```

---

## 12. Lecciones aprendidas

### El accuracy miente

El error más fácil de cometer en este tipo de proyecto es mirar solo el accuracy. Con un dataset desbalanceado, un modelo puede llegar a 70% de accuracy sin haber aprendido nada — simplemente apostando siempre a la clase mayoritaria. El **F1-macro** y el **recall por clase** son los indicadores que importan.

### Las imágenes de laboratorio crean sesgos reales

La diferencia entre Fase 1 (dataset mixto) y Fase 2 (solo campo) no fue drástica, pero fue consistente: todos los modelos rindieron mejor en Fase 1. Esto confirma que había *shortcut learning* — el modelo aprendió parcialmente a clasificar por el fondo de laboratorio. Para producción, importa más el rendimiento en Fase 2.

### Más parámetros ≠ mejor modelo

ResNet50 con 25.6M parámetros rindió peor que EfficientNet-B0 con 5.3M parámetros en el dataset limpio. En datasets moderados, la regularización implícita de un modelo más chico puede ser una ventaja.

### Weighted Loss > Undersampling en casi todos los escenarios

Tirar datos casi siempre es un error en datasets pequeños. Mejor darle más peso a los errores que importan y dejar que el modelo vea todos los ejemplos disponibles.

### La clase `others` es más que un comodín

Sin `others`, el modelo comete errores categóricos en campo: clasifica Black Rot como peronóspora, por ejemplo. La clase `others` no es solo "todo lo demás" — es la garantía de que el modelo puede decir "no sé qué es esto, pero sé que no es oídio ni peronóspora".

---

## Apéndice — Parámetros de entrenamiento (todos los experimentos)

| Parámetro | Valor | Nota |
|-----------|-------|------|
| Input size | 224×224 px | Requerido por EfficientNet-B0 |
| Batch size | 64 | Balance estabilidad / uso de VRAM |
| Learning rate | 1e-4 | Fine-tuning: bajo para no destruir pesos preentrenados |
| Optimizer | AdamW | Corrige el bug de weight decay de Adam |
| Weight decay | 1e-4 | L2 regularization estándar |
| Loss | CrossEntropy + label_smoothing=0.1 | Calibra las probabilidades, reduce overconfidence |
| Early stopping | patience=7 épocas | Detiene el training cuando val_loss no mejora |
| LR scheduler | ReduceLROnPlateau (patience=3, factor=0.5) | Reduce LR si val_loss estanca |
| Max épocas | 15 (30 para exp12/exp24) | Con early stopping, raramente llega al máximo |
| Split | 70/15/15 estratificado | Estratificado para preservar distribución de clases |
| Normalización | ImageNet (mean=[0.485, 0.456, 0.406]) | Obligatorio para Transfer Learning desde ImageNet |
| Pesos iniciales | ImageNet pretrained | Transfer Learning — 1.2M imágenes, 1000 clases |

---

*DetectVID — Proyecto de Tesis | Universidad de Mendoza | Stefano Palazzo | 2026*
