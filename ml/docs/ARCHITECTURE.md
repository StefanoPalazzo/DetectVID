# ARCHITECTURE.md — Decisiones Técnicas de DetectVID

> Documento técnico completo sobre las decisiones de diseño del modelo, con alternativas consideradas y justificación de cada elección.

---

## Índice

1. [Contexto del problema](#1-contexto-del-problema)
2. [Decisión 1 — Transfer Learning vs. entrenamiento desde cero](#2-decisión-1--transfer-learning-vs-entrenamiento-desde-cero)
3. [Decisión 2 — Elección de arquitectura: EfficientNet-B0](#3-decisión-2--elección-de-arquitectura-efficientnet-b0)
4. [Decisión 3 — Fine-tuning completo vs. feature extraction](#4-decisión-3--fine-tuning-completo-vs-feature-extraction)
5. [Decisión 4 — Estrategia de desbalance de clases](#5-decisión-4--estrategia-de-desbalance-de-clases)
6. [Decisión 5 — Loss function: CrossEntropy + Label Smoothing](#6-decisión-5--loss-function-crossentropy--label-smoothing)
7. [Decisión 6 — Optimizador: AdamW](#7-decisión-6--optimizador-adamw)
8. [Decisión 7 — LR Scheduling: ReduceLROnPlateau](#8-decisión-7--lr-scheduling-reducelronplateau)
9. [Decisión 8 — Data Augmentation](#9-decisión-8--data-augmentation)
10. [Decisión 9 — Classifier head de dos capas](#10-decisión-9--classifier-head-de-dos-capas)
11. [Decisión 10 — Split estratificado](#11-decisión-10--split-estratificado)
12. [Decisión 11 — Normalización ImageNet](#12-decisión-11--normalización-imagenet)
13. [Resumen de hiperparámetros](#13-resumen-de-hiperparámetros)

---

## 1. Contexto del problema

**Tarea:** Clasificación multiclase de imágenes de hojas de vid en 3 categorías:
- `healthy` — hoja sana
- `oidio` — Powdery Mildew (*Erysiphe necator*)
- `peronospora` — Downy Mildew (*Plasmopara viticola*)

**Dataset:**
| Clase       | Imágenes |
|-------------|----------|
| healthy     | 6,369    |
| peronospora | 2,659    |
| oidio       |   978    |
| **Total**   | **10,006** |

**Características clave que determinan las decisiones técnicas:**
- Dataset moderado (~10k imágenes), no masivo
- Desbalance significativo: healthy tiene 6.5x más imágenes que oidio
- Imágenes de campo (variabilidad de iluminación, ángulo, zoom)
- Dataset crecerá en el futuro (el sistema debe ser fácilmente re-entrenable)

---

## 2. Decisión 1 — Transfer Learning vs. entrenamiento desde cero

### ✅ Elegido: Transfer Learning desde ImageNet

### Alternativas consideradas:

| Opción | Descripción | Por qué NO |
|--------|-------------|------------|
| Entrenamiento desde cero | Inicializar todos los pesos aleatoriamente | Requiere cientos de miles de imágenes para converger. Con ~10k imágenes el modelo sobreajustaría trivialmente sin regularización extrema |
| Transfer desde PlantVillage | Usar un modelo preentrenado en enfermedades de plantas | No se encontró checkpoint público de calidad verificable. ImageNet provee representaciones de textura y borde más robustas que cualquier preentrenamiento de dominio específico no verificado |
| Self-supervised (SimCLR, DINO) | Preentrenar sin labels en imágenes de hojas | Requiere un corpus grande de imágenes de vid sin etiquetar. No disponible en este proyecto |

### Justificación técnica:

Transfer Learning funciona porque:
1. Las primeras capas de una CNN aprenden detectores de bordes, texturas y gradientes — representaciones útiles para **cualquier** imagen, incluyendo hojas.
2. Las capas intermedias aprenden combinaciones de texturas — exactamente lo que distingue oídio (manchas blancas pulverulentas) de peronospora (manchas amarillas aceitosas) de una hoja sana.
3. El backbone preentrenado en ImageNet (1.2M imágenes, 1000 clases) ya solucionó el problema de la representación. Solo necesitamos especializar el clasificador final.

**Resultado esperado:** convergencia en 15–30 épocas vs. 100+ épocas desde cero.

---

## 3. Decisión 2 — Elección de arquitectura: EfficientNet-B0

### ✅ Elegido: EfficientNet-B0

### Alternativas consideradas en detalle:

| Arquitectura | Parámetros | Top-1 ImageNet | Decisión |
|---|---|---|---|
| **EfficientNet-B0** | 5.3M | 77.1% | ✅ **Elegido** |
| ResNet-18 | 11.7M | 69.8% | ❌ Ver abajo |
| ResNet-50 | 25.6M | 76.1% | ❌ Ver abajo |
| MobileNet-V3 | 5.4M | 75.6% | ❌ Ver abajo |
| VGG-16 | 138M | 71.6% | ❌ Descartado inmediatamente |
| ViT-B/16 | 86M | 81.1% | ❌ Ver abajo |

#### ❌ Por qué no ResNet-18
El notebook de clase usa ResNet-18, lo cual es un excelente punto de partida educativo. Sin embargo:
- ResNet-18 tiene 11.7M parámetros pero solo 69.8% de accuracy en ImageNet
- EfficientNet-B0 tiene **menos de la mitad de parámetros** (5.3M) y un accuracy 7 puntos mayor
- EfficientNet usa *compound scaling*: escala width, depth y resolution de forma coordinada en lugar de simplemente apilar más capas
- Para fine-tuning con dataset moderado, menos parámetros = menos riesgo de overfitting

#### ❌ Por qué no ResNet-50
- El doble de accuracy que ResNet-18, pero 25.6M parámetros
- Con 10k imágenes, el riesgo de overfitting aumenta con más parámetros
- EfficientNet-B0 logra accuracy similar con 5x menos parámetros
- Tiempo de entrenamiento mayor sin beneficio justificado

#### ❌ Por qué no MobileNet-V3
- Diseñado para inferencia en móvil/edge, optimizado para latencia
- EfficientNet-B0 tiene mejor accuracy con parámetros similares
- MobileNet prioriza velocidad sobre representación; en este proyecto la calidad de la clasificación es prioritaria

#### ❌ Por qué no ViT (Vision Transformer)
- Requiere mucho más datos para preentrenar bien (ViT original: 14M+ imágenes)
- Con fine-tuning en ~7k imágenes de training, los transformers tienden a overfitting
- Son más difíciles de interpretar y debuggear
- Tiempo de inferencia mayor; en campo (tablet/laptop) esto importa

#### ❌ Por qué no VGG-16
- 138M parámetros es absurdo para este problema
- Completamente superado por arquitecturas modernas
- Mencionado solo por completitud histórica

### Justificación final para EfficientNet-B0:
Es el punto óptimo en la curva parámetros/accuracy para datasets medianos con Transfer Learning. Compacto, eficiente, bien soportado por PyTorch, y probado en tareas de clasificación de enfermedades en plantas en la literatura científica.

---

## 4. Decisión 3 — Fine-tuning completo vs. feature extraction

### ✅ Elegido: Fine-tuning completo (todos los parámetros entrenables)

### Alternativas:

| Estrategia | Descripción | Por qué NO |
|---|---|---|
| **Fine-tuning completo** | Todos los pesos se actualizan | ✅ **Elegido** |
| Feature extraction puro | Backbone congelado, solo se entrena el head | Limita la capacidad de adaptar representaciones al dominio específico. Válido solo si el dataset es muy pequeño (<500 imágenes) o si el dominio es idéntico al de preentrenamiento |
| Gradual unfreezing | Descongelar capas progresivamente (ULMFiT style) | Más complejo de implementar, marginal benefit con EfficientNet-B0. Reservado para experimentos futuros si hay overfitting severo |
| Layer-wise LR | LR diferente por grupo de capas | Puede ayudar, pero complica el código significativamente. El scheduler ReduceLROnPlateau ya maneja la adaptación del LR |

### Justificación:
Con ~7k imágenes de entrenamiento y fine-tuning desde ImageNet (dominio diferente al de hojas de vid), es beneficioso que **todas las capas** puedan adaptarse. El riesgo de overfitting se mitiga con:
- Data augmentation agresivo
- Weight decay (L2)
- Label smoothing
- Early stopping
- WeightedRandomSampler

Si en experimentos futuros se detecta overfitting severo (val_loss sube mientras train_loss baja), se puede activar `FREEZE_BACKBONE=True` en `config.py`.

---

## 5. Decisión 4 — Estrategia de desbalance de clases

### ✅ Elegido: WeightedRandomSampler en el DataLoader

### Problema:
```
healthy:     6,369 imágenes  (63.6%)
peronospora: 2,659 imágenes  (26.6%)
oidio:         978 imágenes  (9.8%)
```
Sin tratamiento, el modelo puede aprender a predecir siempre "healthy" y obtener ~64% de accuracy, sin aprender nada útil.

### Alternativas:

| Técnica | Descripción | Ventajas | Desventajas |
|---|---|---|---|
| **WeightedRandomSampler** | Samplea clases minoritarias con mayor frecuencia | Balancea sin duplicar en memoria; funciona con cualquier loss | Aumenta el costo computacional por época (más samples del dataset total) |
| class_weight en CrossEntropyLoss | Penaliza más los errores en clases minoritarias | Simple, una línea de código | No balancea los batches; el modelo sigue viendo desequilibrio |
| Oversampling manual (duplicar imágenes) | Copiar físicamente imágenes de clases minoritarias | Simple | Riesgo de overfitting en las imágenes duplicadas |
| Undersampling | Reducir la clase mayoritaria | Balanceo perfecto | Pérdida de información valiosa (~4k imágenes de healthy descartadas) |
| SMOTE para imágenes | Generar imágenes sintéticas interpoladas | Aumenta el dataset sintéticamente | SMOTE no funciona bien en espacio de píxeles (funciona en features tabulares) |

### Justificación:
`WeightedRandomSampler` es la solución más limpia para imágenes:
- No modifica los datos originales
- Cada clase tiene igual probabilidad de aparecer en un batch
- El augmentation se aplica en tiempo real, evitando overfitting sobre imágenes duplicadas
- Compatible con la estructura de DataLoader de PyTorch sin cambios en el código de training

---

## 6. Decisión 5 — Loss function: CrossEntropy + Label Smoothing

### ✅ Elegido: `nn.CrossEntropyLoss(label_smoothing=0.1)`

### Alternativas:

| Loss | Por qué NO |
|---|---|
| CrossEntropy pura | El modelo tiende a ser sobreconfiado: predice 0.99 para una clase cuando debería predecir 0.75 |
| Focal Loss | Útil cuando el desbalance es extremo (>100:1) y WeightedSampler no es suficiente. Aquí el desbalance es 6.5:1, manejable con el sampler |
| Binary CE (one-vs-rest) | Rompe las dependencias entre clases. CrossEntropy multiclase es más correcto |

### ¿Por qué label smoothing = 0.1?
En lugar de entrenar con etiquetas `[0, 0, 1]` (one-hot duras), usamos `[0.033, 0.033, 0.933]`. Esto:
1. Penaliza predicciones demasiado confiadas (>0.93)
2. Mejora la calibración del modelo (las probabilidades reflejan mejor la incertidumbre real)
3. Reduce overfitting en datasets medianos
4. Valor de 0.1 es estándar en la literatura (usado en EfficientNet paper original)

**Nota importante:** `nn.CrossEntropyLoss` en PyTorch espera **logits crudos**, no probabilidades. NO aplicamos Softmax en el `forward()` del modelo.

---

## 7. Decisión 6 — Optimizador: AdamW

### ✅ Elegido: `torch.optim.AdamW(lr=1e-4, weight_decay=1e-4)`

### Alternativas:

| Optimizador | Por qué NO |
|---|---|
| SGD + momentum | Requiere tuning cuidadoso del LR y momentum. Adam converge más rápido con menos tuning |
| Adam (clásico) | Tiene un bug en la implementación de L2 regularization: el weight decay se aplica después del update de Adam, lo cual no es correcto matemáticamente. AdamW corrige esto |
| RMSProp | Precursor de Adam, superado en práctica |
| LAMB | Diseñado para batch sizes muy grandes (>4096). No aplica |

### ¿Por qué LR = 1e-4?
- Fine-tuning en backbone preentrenado requiere un LR bajo
- Si el LR es muy alto (ej. 1e-3), el fine-tuning destruye los pesos preentrenados rápidamente (*catastrophic forgetting*)
- 1e-4 es el valor canónico para fine-tuning en visión computacional

---

## 8. Decisión 7 — LR Scheduling: ReduceLROnPlateau

### ✅ Elegido: `ReduceLROnPlateau(patience=3, factor=0.5)`

### Alternativas:

| Scheduler | Por qué NO |
|---|---|
| **ReduceLROnPlateau** | ✅ Se adapta al comportamiento real del entrenamiento |
| CosineAnnealingLR | Predecible pero no se adapta. Si el modelo converge rápido, sigue bajando el LR innecesariamente |
| StepLR | Reduce el LR cada N épocas fijo, sin importar si hay mejora |
| OneCycleLR | Excelente para training desde cero, pero con fine-tuning la fase de warmup puede ser contraproducente |
| ConstantLR | Sin scheduling, el modelo se estanca más rápido |

### Lógica:
- Si la `val_loss` no mejora en 3 épocas → reduce LR a la mitad
- Si la `val_loss` no mejora en 7 épocas (EarlyStopping) → detiene el entrenamiento
- LR mínimo: 1e-7 (por debajo de esto, los updates son insignificantes)

---

## 9. Decisión 8 — Data Augmentation

### ✅ Elegido: augmentation orientado a condiciones de campo

```python
RandomHorizontalFlip(p=0.5)    # Hojas no tienen orientación fija
RandomVerticalFlip(p=0.3)       # Fotos tomadas desde ángulos variados
RandomRotation(20°)             # Variación de ángulo en campo
ColorJitter(b=0.2, c=0.2, ...)  # Iluminación variable (sol, sombra, nubes)
RandomResizedCrop(224)          # Zoom variable del fotógrafo
RandomErasing(p=0.1)            # Simula oclusiones (manchas de agua, suciedad)
```

### ¿Qué NO se incluyó y por qué?

| Augmentation | Razón para no incluir |
|---|---|
| GaussianBlur agresivo | Borrar la textura de la enfermedad (el polvo de oídio) sería contraproducente |
| Grayscale | El color es una feature importante: oídio → blanco, peronospora → amarillo/marrón |
| CutMix / MixUp | Mezclar imágenes de diferentes enfermedades puede crear ejemplos ambiguos confusos |
| Flips extremos (>30°) de rotación | Más de 20° de rotación genera imágenes poco realistas para hojas en planta |

---

## 10. Decisión 9 — Classifier head de dos capas

### ✅ Elegido: `Linear(1280 → 512 → 3)` con Dropout y ReLU

### Alternativas:

| Head | Por qué NO |
|---|---|
| Linear(1280 → 3) directamente | Salto demasiado abrupto. El modelo no tiene capacidad de aprender representaciones intermedias específicas de hojas de vid |
| **Linear(1280 → 512 → 3)** | ✅ Balance entre capacidad y eficiencia |
| Linear(1280 → 512 → 256 → 3) | Innecesariamente complejo para 3 clases. Más parámetros = más overfitting sin beneficio |

### Valores de Dropout:
- `Dropout(0.3)` antes de la primera capa lineal: regularización moderada
- `Dropout(0.2)` antes de la segunda: regularización suave (cerca de la salida)
- Se aplican **solo durante training** (PyTorch lo maneja automáticamente con `model.eval()`)

---

## 11. Decisión 10 — Split estratificado 70/15/15

### ✅ Elegido: `train_test_split` con `stratify=label`

### Por qué estratificado:
Sin estratificación, un split random podría resultar en, por ejemplo, solo 5 imágenes de oídio en el test set — estadísticamente insuficiente para medir el rendimiento real en esa clase.

Con `stratify`, garantizamos que cada split tiene la **misma distribución de clases** que el dataset completo.

### Por qué 70/15/15 y no 80/10/10:
- Con datasets pequeños, 10% de test puede ser demasiado poco para estimar métricas confiables
- 15% de test = ~1,500 imágenes, suficiente para confidence intervals razonables
- 15% de val = ~1,500 imágenes, suficiente para early stopping estable

---

## 12. Decisión 11 — Normalización ImageNet

### ✅ Elegido: `Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])`

### Por qué estas estadísticas específicas:
El backbone de EfficientNet-B0 fue preentrenado con estas estadísticas. Si normalizamos con valores diferentes, el backbone "ve" distribuciones de activación muy distintas a las que vio durante preentrenamiento, y el fine-tuning tarda mucho más (o falla).

### Por qué NO usar las estadísticas del dataset propio:
- Calcular `mean/std` del dataset de vid rompería la correspondencia con los pesos preentrenados
- Solo sería correcto si entrenaríamos desde cero
- La normalización ImageNet es estándar para cualquier modelo fine-tuneado desde ImageNet

---

## 13. Resumen de hiperparámetros

| Parámetro | Valor | Justificación |
|---|---|---|
| Arquitectura | EfficientNet-B0 | Mejor ratio accuracy/parámetros para datasets medianos |
| Pesos iniciales | ImageNet | Transfer Learning obligatorio con ~10k imágenes |
| Freeze backbone | False | Fine-tuning completo con LR bajo |
| Input size | 224×224 | Requerido por EfficientNet-B0 |
| Batch size | 32 | Balance entre estabilidad de gradientes y uso de VRAM |
| Learning rate | 1e-4 | Fine-tuning: bajo para no destruir pesos preentrenados |
| Optimizer | AdamW | Corrige el bug de weight decay de Adam |
| Weight decay | 1e-4 | L2 regularization estándar |
| Loss | CrossEntropy + LS=0.1 | Multiclase + calibración |
| Sampler | WeightedRandom | Compensación de desbalance |
| Augmentation | Orientado a campo | Flip, rotate, color jitter, erase |
| Early stopping | patience=7 | Evita overfitting sin detener prematuramente |
| LR scheduler | ReduceLROnPlateau | Adaptativo al comportamiento real |
| Epochs máx | 30 | Con early stopping, raramente se llega al máximo |

---

*Documento generado para DetectVID — Clasificación de enfermedades en hojas de vid.*
*Para experimentos y métricas, ver [EXPERIMENTS.md](./docs/EXPERIMENTS.md)*
