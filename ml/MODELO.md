# DetectVID — Tutorial de Machine Learning Aplicado
## Guía completa del modelo de clasificación de enfermedades en hojas de vid

> **Para quién es esto:** Para vos, que sos el autor del proyecto y necesitás entender *por qué* cada decisión fue tomada, no solo *qué* hace el código. Este documento es tu referencia de cabecera.

---

## 1. El problema

### ¿Qué estamos resolviendo?

Tenemos hojas de vid que pueden estar en tres estados:
- **Sana (healthy)**: la hoja no muestra signos de enfermedad
- **Oídio (Oidium tuckeri)**: infección fúngica que aparece como polvo blanco en la superficie
- **Peronospora (Plasmopara viticola)**: infección por oomiceto que genera manchas amarillas y polvo grisáceo

El objetivo es: dada una foto de una hoja, decir en cuál de estos tres estados está.

### ¿Por qué es un problema de clasificación de imágenes?

Porque la entrada es una imagen (una matriz de píxeles RGB) y la salida es una categoría discreta entre tres opciones. En ML esto se llama **clasificación multiclase**:

- Si hubiera dos clases (sana / enferma) sería clasificación binaria
- Si la salida fuera un número continuo (ej: "qué tan enferma está, del 0 al 1") sería regresión
- Con 3+ clases es clasificación multiclase → usamos CrossEntropyLoss, no BCELoss

### ¿Por qué ML y no reglas manuales?

La alternativa sería escribir reglas explícitas: "si hay píxeles blancos en la superficie → oídio". Esto falla porque:

1. **Variabilidad enorme**: la misma enfermedad puede verse diferente según la especie de vid, la iluminación, el ángulo de la foto, la etapa de desarrollo de la enfermedad
2. **Superposición visual**: el polvo blanco del oídio puede confundirse con reflejo de luz solar o con daño por granizo
3. **Escalabilidad**: si mañana querés agregar una cuarta enfermedad, tenés que re-escribir todas las reglas

Con ML, el modelo **aprende automáticamente** qué patrones visuales distinguen cada clase, directamente de los datos. Las reglas emergen del entrenamiento, no del programador.

---

## 2. El dataset

### Cómo está organizado

El dataset vive en `../Datasets/` (un nivel arriba del proyecto `ml/`). Estructura real del disco:

```
Datasets/
├── healthy/          → 6.370 imágenes
│   ├── Healthy/      → PlantVillage dataset (fondo controlado, UUID en nombre)
│   ├── Healthy Leaves/
│   ├── healthy_train/
│   └── healthy_test/
├── oidio/            → 979 imágenes
│   └── 白粉病 - oidio/   → fotos de campo reales (nombres IMG200X_XXXX.JPG)
├── peronospora/      → 2.662 imágenes
│   └── Downy Mildew/ → PlantVillage/mixed (nombres Downy Mildew_NNN.jpg)
└── otros/            → 17.130 imágenes (NO SE USA en el modelo actual)
```

**Totales que ve el modelo:** healthy=6.370 | oidio=979 | peronospora=2.662 → **10.011 imágenes**

### Cómo sabe el código qué clase tiene cada imagen

Esta es la pregunta crítica, especialmente porque el cache mezcla todo en una carpeta. El mecanismo tiene **dos niveles**:

**Nivel 1: el DataFrame (la fuente de verdad)**

`dataset.py:scan_class_dir()` recorre cada directorio y construye una lista de dicts:
```python
{"image_path": "/absolute/path/to/image.jpg", "label": "healthy"}
```
El `label` viene de la **carpeta** que se le pasa, no del nombre del archivo. Esto es clave: si una imagen está en `CLASS_DIRS["healthy"]`, su label es `"healthy"`, sin importar cómo se llame el archivo.

**Nivel 2: el cache indexado por posición**

El cache NO guarda el nombre del archivo. Guarda tensores nombrados `{idx}.pt` donde `idx` es el índice de la fila en el DataFrame del split.

```python
# En _build_cache():
for idx, row in df.iterrows():
    tensor_path = cache_subdir / f"{idx}.pt"   # ← nombre = posición en DataFrame
    torch.save(tensor, tensor_path)

# En __getitem__():
tensor_path = self.cache_dir / f"{idx}.pt"     # ← reconstruye la ruta por posición
label_idx = CLASS_TO_IDX[row["label"]]         # ← label viene del DataFrame, no del archivo
```

El DataFrame se mantiene en memoria durante todo el entrenamiento. `VidLeafDataset` recibe TANTO el cache_dir como el df, entonces siempre puede hacer `df.iloc[idx]["label"]` para saber la clase de cada tensor.

**Conclusión:** el nombre del archivo original no importa en absoluto para las clases. La clase está en el DataFrame que se construye al inicio y se preserva en memoria.

### Conteo real y qué implica el desbalance

| Clase       | Imágenes | % del total | Peso en loss |
|-------------|----------|-------------|--------------|
| healthy     | 6.370    | 63.6%       | bajo (≈0.52) |
| oidio       | 979      | 9.8%        | alto (≈3.40) |
| peronospora | 2.662    | 26.6%       | medio (≈1.25)|

**El problema del desbalance:** si el modelo aprende a responder "healthy" para TODAS las imágenes, tendría 63.6% de accuracy. Eso es terrible — el modelo no estaría aprendiendo nada, solo memorizando la clase mayoritaria.

**La solución son los class weights:** la fórmula exacta usada es:

```python
weight_i = N_total / (N_clases * N_clase_i)
# oidio: 10011 / (3 * 979) = 3.41
# peronospora: 10011 / (3 * 2662) = 1.25
# healthy: 10011 / (3 * 6370) = 0.52
```

El efecto: si el modelo se equivoca en una imagen de oídio, la penalización es **6.5x mayor** que equivocarse en una imagen sana. Esto fuerza al modelo a prestar atención a las clases minoritarias.

### Domain shift: el problema más importante del proyecto

Este es el origen de la falla en hojas sanas. Hay que entenderlo bien.

**Qué es domain shift:** el modelo aprende a reconocer patrones en el dominio de entrenamiento. Si las fotos de entrenamiento tienen características sistemáticas diferentes a las fotos de producción, el modelo falla aunque sea excelente en validación.

**Lo que tenemos en este proyecto:**

| Clase | Origen de imágenes de entrenamiento | Características |
|-------|-------------------------------------|-----------------|
| healthy | PlantVillage dataset | Hoja aislada sobre fondo neutro (gris/negro), iluminación controlada, ángulo estandarizado, alta resolución |
| oidio | Fotos de campo reales (nombres IMG200X) | Fondo verde/tierra, iluminación natural variable, ángulos arbitrarios |
| peronospora | PlantVillage / mixed | Mixto |

**Las fotos de prueba (healthy2/3/4.jpg):** son fotos tomadas en campo real, con fondo natural, variaciones de luz, múltiples hojas en el encuadre.

**La analogía concreta:** Imaginá que entrenás a un médico para reconocer una enfermedad de piel mostrándole ÚNICAMENTE fotos de consultorio: luz blanca, fondo neutro, paciente estático, cámara a 30cm. Ese médico va a ser perfecto en validación (porque el test set también es del consultorio). Pero si en el mundo real le mostrás una foto tomada en la playa con sol directo, va a fallar. El problema no es el médico — es que nunca vio ese contexto.

El modelo aprendió que "hoja sana = fondo neutro + iluminación controlada". Cuando ve una hoja sana real con fondo verde y luz natural, el patrón no matchea → predice enfermedad.

**Por qué val_acc=1.0 puede ser una trampa:** si el val set viene del mismo dominio que el train set (PlantVillage), 1.0 de accuracy significa que el modelo memorizó perfectamente ese dominio. NO significa que generaliza a fotos de campo. Es overfitting al dominio, no al dataset individual.

---

## 3. Preprocesamiento y Transforms

### El pipeline completo de una imagen

Una imagen pasa por estas etapas antes de llegar al modelo:

```
Imagen original (cualquier tamaño, formato)
    ↓ PIL Image.open().convert("RGB")    → [H, W, 3] uint8
    ↓ Resize(224, 224)                   → [224, 224, 3] uint8
    ↓ ToTensor()                         → [3, 224, 224] float32 en [0, 1]
    ↓ [CACHE] guarda como .pt ──────────────────────────────┐
    ↓                                                        │ carga directa
    ↓ RandomHorizontalFlip (solo train)  → [3, 224, 224]    │ en épocas siguientes
    ↓ RandomVerticalFlip (solo train)    → [3, 224, 224]    │
    ↓ ColorJitter (solo train)           → [3, 224, 224]    │
    ↓ Normalize(mean, std)               → [3, 224, 224] float32 en [-2.1, 2.6]
    ↓ RandomErasing (solo train)         → [3, 224, 224]
    → modelo recibe este tensor
```

### Normalización: de dónde salen los valores exactamente

```python
IMAGENET_MEAN = [0.485, 0.456, 0.406]  # media por canal (R, G, B)
IMAGENET_STD  = [0.229, 0.224, 0.225]  # desviación estándar por canal
```

Estos valores **no son inventados**. Son la media y desviación estándar calculadas sobre las 1.2 millones de imágenes del dataset ImageNet. Cada pixel se normaliza como:

```
pixel_normalizado = (pixel_original - media_canal) / std_canal
```

**Por qué es obligatorio:** EfficientNet-B0 fue pre-entrenado con estas estadísticas. Sus pesos internos "esperan" que los inputs tengan esta distribución. Si normalizás diferente (o no normalizás), las features que extrae el backbone no tienen sentido → performance cae drásticamente.

**Analogía:** Es como si ajustás un piano a 440 Hz (La estándar) y luego intentás tocar con un instrumento afinado en 432 Hz. Las notas suenan "parecidas" pero todo está levemente desfasado.

### Normalización en inferencia: ¿es consistente?

Sí. En `predict.py` se aplica exactamente el mismo preprocesamiento:
```python
transforms.Resize(INPUT_SIZE),
transforms.ToTensor(),
transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
```
No hay bug de normalización aquí.

### Data Augmentation: por qué solo en train

**Augmentation en train:** genera variaciones artificiales de cada imagen durante el entrenamiento. El modelo ve la "misma" hoja rotada, espejada, con diferente brillo → aprende que esas variaciones no cambian la clase → mejor generalización.

**Por qué NUNCA en val/test:** el set de validación simula producción real. Si le aplicás augmentation, estás evaluando en condiciones que no existen → las métricas no reflejan el rendimiento real. Es como practicar un examen con preguntas random y luego quejarte de que las preguntas reales son diferentes.

### Cada transform explicado

| Transform | Parámetros | Propósito | Por qué elegido |
|-----------|-----------|-----------|-----------------|
| `RandomHorizontalFlip(p=0.5)` | 50% de probabilidad | Espeja la hoja horizontalmente | Una hoja girada 180° sigue siendo oídio. La orientación no es diagnóstica. Costo: ~0ms |
| `RandomVerticalFlip(p=0.3)` | 30% de probabilidad | Espeja verticalmente | Idem. p=0.3 y no 0.5 porque las hojas tienen una cara "natural" que es más común | 
| `ColorJitter(brightness=0.15, contrast=0.15, saturation=0.1, hue=0.03)` | Valores bajos | Simula variaciones de iluminación solar | Los colores son diagnósticos (el polvo blanco del oídio, las manchas amarillas de peronospora). Valores altos destruirían esa señal |
| `Normalize(IMAGENET_MEAN, IMAGENET_STD)` | Fijo | Alinea la distribución de valores con ImageNet | Obligatorio para que el backbone funcione correctamente |
| `RandomErasing(p=0.1)` | 10% de probabilidad | Borra un rectángulo random de la imagen | Simula oclusiones (ramas, gotas de agua, dedos en la foto). p=0.1 porque es un evento raro |

**Transforms que se descartaron y por qué:**

- `RandomRotation`: costo de ~2ms/imagen en CPU. Con 7000 imágenes por época son 14 segundos solo en rotaciones. HFlip + VFlip ya cubren las 4 orientaciones cardinales.
- `RandomResizedCrop`: requiere re-procesar la imagen con PIL desde adentro del DataLoader (lento). El resize ya está hecho en el pre-cache.
- `GaussianBlur`: las texturas finas (polvo del oídio) son la señal diagnóstica. Blur las destruye.

### Por qué Resize(224)

EfficientNet-B0 fue diseñado y pre-entrenado para inputs de 224×224. Este tamaño no es arbitrario — viene de ImageNet, que usa 224×224 como estándar. 

Si usarás una imagen de 256×256 o 512×512, el backbone técnicamente funciona (las CNNs son flexibles al tamaño), pero los pesos pre-entrenados están optimizados para 224×224. Además, 224×224 es un buen balance entre detalle suficiente y eficiencia computacional.

**Alternativas consideradas:**
- `albumentations`: librería más potente, con 70+ transforms incluyendo simulación de condiciones climáticas, ruido fotográfico, lens distortion. **No elegida** porque agrega una dependencia pesada y para este proyecto los transforms de torchvision son suficientes. Si el problema del domain shift no se resuelve con datos, sería el siguiente paso.

---

## 4. La arquitectura

### Qué es una CNN: cómo "ve" una imagen

Una red neuronal convolucional (CNN) no analiza una imagen píxel por píxel en forma lineal. En cambio, aplica **filtros** que detectan patrones locales.

**Analogía del filtro:** Pensá en un filtro como una lupa pequeña (por ejemplo 3×3 píxeles) que se desliza por toda la imagen. Cuando esa lupa está sobre un borde diagonal, el filtro "se activa" fuertemente. Cuando está sobre un área plana, casi no se activa.

Una CNN tiene cientos de estos filtros. Las primeras capas aprenden filtros simples (bordes horizontales, verticales, esquinas). Las capas más profundas combinan esos patrones simples para detectar estructuras más complejas (texturas, formas, objetos).

```
Imagen → Capa 1 (bordes) → Capa 2 (texturas) → Capa 3 (patrones) → ... → Clasificador
```

El output de cada capa se llama **feature map**: una representación comprimida de qué tan "activo" está cada filtro en cada posición de la imagen.

### Transfer Learning: por qué es la decisión correcta

Entrenar una CNN desde cero en nuestro dataset (10k imágenes) producría resultados mediocres. Las CNNs necesitan millones de imágenes para aprender los filtros básicos de procesamiento visual.

**Transfer Learning** resuelve esto: tomamos un modelo ya entrenado en ImageNet (1.2M imágenes, 1000 clases) y solo re-entrenamos las últimas capas. El backbone ya sabe detectar bordes, texturas, formas — esas habilidades son útiles para cualquier tarea visual, incluyendo detectar enfermedades en hojas.

**Analogía:** Un sommelier experto puede aprender a distinguir una nueva variedad de vino mucho más rápido que alguien sin entrenamiento. Su capacidad de detectar taninos, acidez y bouquet ya está desarrollada — solo necesita aplicarla a la nueva variedad.

Resultados esperables:
- **Transfer Learning:** 90%+ accuracy con 10k imágenes
- **From scratch:** 60-70% accuracy con 10k imágenes, necesitaría >100k para competir

### Por qué EfficientNet-B0 y no otros modelos

| Modelo | Params | Top-1 ImageNet | Velocidad MPS | Complejidad |
|--------|--------|---------------|---------------|-------------|
| **EfficientNet-B0** | 5.3M | 77.1% | Media | Media |
| ResNet18 | 11.7M | 69.8% | Rápida | Baja |
| ResNet50 | 25.6M | 76.1% | Lenta | Media |
| VGG16 | 138M | 71.6% | Muy lenta | Baja |
| MobileNetV3-Large | 5.4M | 74.0% | Rápida | Media |
| ViT-B/16 | 86M | 81.1% | Muy lenta | Alta |

**EfficientNet-B0 se eligió porque:**
- Mejor ratio accuracy/parámetros de la tabla
- 5.3M params cabe cómodamente en RAM de Colab Free
- Los **Squeeze-and-Excite blocks** le dan "atención" por canal: aprende que el canal rojo es más importante para detectar manchas que el canal azul
- Velocidad acceptable en MPS (M4 Pro)

**Por qué no ResNet18:** Tiene más parámetros (11.7M) y menos accuracy en ImageNet (69.8%). Es más GPU-friendly (operaciones más simples) pero EfficientNet-B0 gana en accuracy. ResNet18 es una buena alternativa si la velocidad de entrenamiento es lo más crítico.

**Por qué no ResNet50:** Mismo accuracy que EfficientNet-B0 pero 5x más parámetros. Más lento, más costoso en memoria, sin beneficio.

**Por qué no VGG16:** 138M parámetros para 71.6% de accuracy. Arquitectura obsoleta. No usar.

**Por qué no ViT:** Los Vision Transformers necesitan datasets enormes para brillar (>1M imágenes). Con 10k imágenes, el transfer learning desde ViT-B/16 pre-entrenado puede funcionar pero agrega complejidad y tiempo de entrenamiento sin ganancia clara sobre EfficientNet en este dominio.

### El custom head: qué hace cada capa

El **head** (cabeza del clasificador) es la parte que reemplazamos. El backbone original terminaba con una capa `Linear(1280 → 1000)` para las 1000 clases de ImageNet. Nosotros la reemplazamos por:

```python
nn.Sequential(
    nn.Dropout(p=0.3),          # ← 1
    nn.Linear(1280, 512),       # ← 2
    nn.ReLU(),                  # ← 3
    nn.Dropout(p=0.2),          # ← 4
    nn.Linear(512, 3),          # ← 5 salida: 3 logits
)
```

**Capa 1 — Dropout(0.3):** En cada forward pass, desactiva aleatoriamente el 30% de las 1280 features. Esto fuerza al modelo a no depender de ninguna feature individual → regularización → menos overfitting. Solo actúa en `model.train()`, no en `model.eval()`.

**Capa 2 — Linear(1280 → 512):** Reduce la dimensionalidad de 1280 a 512. Aprende cómo combinar las features del backbone para el dominio específico (hojas de vid). Saltar directo de 1280 → 3 es demasiado abrupto — la red necesita espacio para construir representaciones intermedias.

**Capa 3 — ReLU():** Activación no-lineal. Sin esto, dos capas Linear seguidas son equivalentes a una sola (operaciones lineales se componen en lineales). ReLU introduce no-linealidad: `ReLU(x) = max(0, x)`. Transforma el espacio de features de forma no-lineal, permitiendo aprender fronteras de decisión más complejas.

**Capa 4 — Dropout(0.2):** Segundo dropout más suave (20%). Misma función que el primero, pero sobre las 512 features ya procesadas.

**Capa 5 — Linear(512 → 3):** La capa final. Produce 3 números (logits), uno por clase. El logit más alto es la predicción. **No hay Softmax aquí** porque `CrossEntropyLoss` lo incluye internamente.

### Fine-tuning vs feature extraction

**Feature extraction (FREEZE_BACKBONE=True):** Congela todos los pesos del backbone y solo entrena el head. Equivale a usar el backbone como un extractor de features fijo.
- Ventaja: más rápido (menos parámetros que actualizar)
- Desventaja: el backbone no se adapta al dominio de hojas de vid
- Cuándo usar: con <500 imágenes de entrenamiento

**Fine-tuning (FREEZE_BACKBONE=False, el elegido):** Re-entrena TODO el modelo, incluyendo el backbone.
- Ventaja: el backbone se adapta al dominio → mejor performance
- Desventaja: más lento, necesita lr más bajo (si es muy alto destruye los pesos pre-entrenados)
- Cuándo usar: con >1000 imágenes de entrenamiento. Nuestro caso: 7.000 → fine-tuning es correcto.

**Nota sobre differential learning rates:** el código actual usa el mismo lr para todo el modelo (`optim.AdamW(model.parameters(), lr=1e-4)`). Una mejora posible sería usar lr diferenciado:
```python
optimizer = optim.AdamW([
    {"params": model.backbone.features.parameters(), "lr": 1e-5},  # backbone: lr muy bajo
    {"params": model.backbone.classifier.parameters(), "lr": 1e-3}, # head: lr normal
])
```
El backbone ya tiene buenos pesos → pasos pequeños. El head se inicializa random → puede aprender más rápido.

---

## 5. La función de pérdida

### CrossEntropyLoss: intuición sin matemáticas terroríficas

El modelo produce 3 números (logits) por imagen, ej: `[2.1, 0.3, -0.8]`.

Después de softmax, estos se convierten en probabilidades: `[0.81, 0.19, 0.05]`.

Si la clase correcta era la 0 (healthy), la loss es `-log(0.81) = 0.21`. Bajo, bien.

Si el modelo hubiera dicho `[0.1, 0.3, 0.6]` (probabilidad 0.1 para la clase correcta), la loss sería `-log(0.1) = 2.30`. Alto, mal.

**La intuición:** CrossEntropy penaliza exponencialmente cuando el modelo está seguro pero equivocado. Si decís "90% peronospora" y era sana, la penalización es enorme. Si decís "35% sana" con dudas, la penalización es moderada.

### Alternativas y cuándo usarlas

| Loss | Cuándo usar | Por qué no aquí |
|------|-------------|-----------------|
| **CrossEntropyLoss** (elegida) | Clasificación multiclase (3+ clases) | — |
| `BCELoss` | Clasificación binaria (2 clases) | Tenemos 3 clases |
| `BCEWithLogitsLoss` | Multi-label (una imagen puede ser de múltiples clases) | Nuestras clases son mutuamente excluyentes |
| `FocalLoss` | Desbalance extremo (1:100 o más) | Nuestro desbalance (1:6) se maneja con class_weights |

**FocalLoss** merece mención especial: agrega un factor `(1-p)^γ` que reduce la contribución de ejemplos fáciles (donde el modelo ya está seguro) y focaliza el entrenamiento en ejemplos difíciles. Con γ=2, si el modelo tiene 90% de confianza, ese ejemplo contribuye 100x menos a la loss. Sería la siguiente alternativa a probar si los class_weights no fueran suficientes.

### Label Smoothing: qué es y por qué 0.1

Con label_smoothing=0, los targets son "duros": [0, 1, 0] (la clase 1 es 100% correcta).

Con label_smoothing=0.1, los targets se "suavizan": [0.033, 0.933, 0.033].

**El efecto:** el modelo nunca puede estar 100% seguro, porque el target máximo es 0.933, no 1.0. Esto previene el fenómeno de "overconfidence": sin smoothing, el modelo aprende a empujar la probabilidad de la clase correcta hacia 1.0 y las demás hacia 0.0, incluso en ejemplos ambiguos. Resultado: calibración de probabilidades más honesta.

- **label_smoothing=0.0:** Sin suavizado. El modelo puede volverse muy seguro → overconfidence → probabilidades como "99.8% peronospora" que no reflejan la incertidumbre real.
- **label_smoothing=0.1 (elegido):** Balance razonable. La literatura muestra mejoras de 0.5-1% en accuracy.
- **label_smoothing=0.3:** Demasiado suavizado. El modelo nunca aprende a ser decisivo → accuracy baja.

---

## 6. El optimizador

### Gradiente descendente: la analogía de bajar una montaña

Imaginate parado en una montaña con niebla. Querés llegar al punto más bajo (mínimo de la loss). No podés ver nada, pero podés sentir la inclinación del suelo bajo tus pies (el gradiente).

La estrategia: siempre moverte en la dirección de mayor descenso. El paso que das es el **learning rate**. Si el paso es muy grande, podés saltar por encima del mínimo. Si es muy pequeño, tardás siglos en llegar.

**El gradiente** es el vector de derivadas parciales de la loss con respecto a cada peso del modelo. Dice: "si aumentás este peso un poquito, la loss aumenta/disminuye en X". El optimizador toma esa información y ajusta todos los pesos en la dirección que disminuye la loss.

### AdamW vs alternativas

| Optimizer | Pros | Contras | Cuándo usar |
|-----------|------|---------|-------------|
| **AdamW** (elegido) | Converge rápido, maneja gradientes de distinta escala, weight decay correcto | Más memoria (guarda momento) | Fine-tuning en general |
| `SGD + momentum` | Generaliza mejor en algunos casos, menos memoria | Más sensible al lr, necesita tuning manual | Training from scratch, investigación |
| `Adam` | Similar a AdamW | Weight decay acoplado (bug histórico) | No usar: AdamW lo reemplaza |
| `RMSprop` | Bueno para RNNs | Menos estable que Adam para CNNs | RNNs, RL |

**Por qué AdamW y no Adam:** Adam tiene un bug histórico donde el weight decay se aplica después del scaling de Adam, lo que lo hace menos efectivo. AdamW corrige esto aplicando weight decay directamente a los pesos. Para la práctica, AdamW converge mejor con regularización.

**Weight decay (1e-4):** penaliza los pesos grandes durante el entrenamiento. Si un peso crece mucho, el penalty hace que la loss aumente → los pesos se mantienen pequeños → el modelo no puede "memorizar" el training set → menos overfitting. Es regularización L2 en los pesos.

**Por qué lr=1e-4:**
El lr "default" de Adam es 1e-3. Nosotros usamos 1e-4 porque hacemos fine-tuning sobre pesos pre-entrenados. Con lr=1e-3 los gradientes son tan grandes que "destruyen" las features aprendidas en ImageNet durante las primeras épocas (fenómeno llamado "catastrophic forgetting"). La regla de oro: fine-tuning → lr 10x menor que training from scratch.

---

## 7. Learning Rate Scheduler

### Por qué no usar lr fijo

Usar el mismo lr durante todo el training es subóptimo:

- Al principio, lr grande es bueno: nos movemos rápido hacia una región baja de la loss
- En las últimas épocas, lr grande es malo: el modelo ya está cerca del mínimo y los pasos grandes lo hacen oscilar alrededor sin converger

La solución: reducir el lr progresivamente.

### ReduceLROnPlateau: el elegido

```python
scheduler = ReduceLROnPlateau(
    optimizer,
    mode="min",        # monitorear val_loss (queremos minimizarla)
    patience=3,        # esperar 3 épocas sin mejora antes de reducir
    factor=0.5,        # LR = LR * 0.5 (reducir a la mitad)
    min_lr=1e-7,       # piso: nunca bajar de este valor
)
```

Lógica: "Si val_loss no mejoró en 3 épocas, probablemente estamos cerca de un mínimo. Reducir lr para dar pasos más pequeños y refinados."

### Comparación de schedulers

| Scheduler | Cuándo reduce LR | Cuándo usar |
|-----------|-----------------|-------------|
| **ReduceLROnPlateau** (elegido) | Cuando val_loss se estanca | Cuando no sabés de antemano cuándo necesitás reducir |
| `StepLR` | Cada N épocas fijas (ej: cada 7) | Cuando tenés experiencia con el dataset y sabés el patrón |
| `CosineAnnealingLR` | Gradualmente siguiendo coseno | Cuando querés scheduling suave predecible |
| `OneCycleLR` | Sube rápido y baja coseno | Training from scratch con ciclos cortos |

**ReduceLROnPlateau se eligió** porque es adaptive: no necesitás saber de antemano cuándo el modelo va a plateaur. La curva de aprendizaje de cada experimento es diferente.

### Warmup

El código actual **no usa warmup**. Warmup significa empezar con lr muy bajo y subirlo gradualmente durante las primeras épocas. Es útil cuando el head se inicializa random (valores de pesos muy lejos del óptimo) — si el lr es alto desde el primer batch, los gradientes son caóticos.

En nuestro caso, lr=1e-4 ya es suficientemente bajo para evitar el problema en las primeras épocas. Si se notan oscilaciones en el training loss en las primeras 2-3 épocas, agregar warmup de 1-2 épocas sería el fix.

---

## 8. El loop de entrenamiento

### Forward pass → loss → backward → step: paso a paso

```python
# Para cada batch:

# 1. Limpiar gradientes del batch anterior
optimizer.zero_grad()

# 2. FORWARD PASS: imagen → modelo → logits
with torch.amp.autocast(device_type="mps", enabled=True):
    outputs = model(images)       # shape: (64, 3) — 64 logits por clase
    loss = criterion(outputs, labels)  # un número: el error promedio del batch

# 3. BACKWARD PASS: calcular gradientes
loss.backward()  # PyTorch recorre el grafo hacia atrás y calcula dL/dW para cada peso

# 4. Gradient clipping
nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

# 5. OPTIMIZER STEP: actualizar pesos
optimizer.step()  # W = W - lr * gradiente (simplificado)
```

**Por qué zero_grad() antes de cada batch:** PyTorch ACUMULA gradientes por defecto (los suma al gradiente existente en vez de reemplazarlo). Si no limpias, el paso 3 de hoy se suma al de ayer → los pasos de optimización son incorrectos.

### Gradient clipping: por qué y cuándo importa

```python
nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
```

Limita la norma del vector de gradientes a 1.0. Si los gradientes son muy grandes (fenómeno llamado "exploding gradients"), el modelo da un paso gigante en una dirección mala → inestabilidad.

Con fine-tuning esto no suele ser crítico, pero es una salvaguarda barata. Con `max_norm=1.0`, si la norma total de los gradientes supera 1.0, todos los gradientes se escalan proporcionalmente para que la norma sea exactamente 1.0.

### AMP (Automatic Mixed Precision)

AMP mezcla cálculos en float32 y float16 según la estabilidad numérica:

- **float32** (32 bits por número): preciso pero pesado en memoria
- **float16** (16 bits): 2x más eficiente en memoria y velocidad, pero con rango numérico más limitado

PyTorch sabe automáticamente qué operaciones son seguras en float16 (multiplicaciones matriciales) y cuáles necesitan float32 (softmax, ciertas normalizaciones).

**Por qué AMP sin GradScaler en MPS:**
En CUDA, float16 puede producir gradientes tan pequeños que se redondean a 0 (underflow). GradScaler los amplifica antes del backward y los desescala antes del optimizer step. En MPS de Apple, Metal usa bfloat16 internamente que tiene mejor rango numérico → no necesita GradScaler.

### Early Stopping: paciencia=7

```python
EARLY_STOPPING_PATIENCE = 7
EARLY_STOPPING_DELTA    = 0.001
```

Si val_loss no mejora en 7 épocas consecutivas (con un delta mínimo de 0.001), el entrenamiento se detiene. 

- **Paciencia=5:** Se detiene muy temprano. Puede interrumpir el training justo antes de que el LR scheduler ayude al modelo a escapar de un mínimo local.
- **Paciencia=7 (elegida):** Balance: le da tiempo al scheduler de reducir el lr (patience=3) y luego 4 épocas más para ver si la reducción ayuda.
- **Paciencia=20:** Sigue entrenando mucho tiempo sin mejora → desperdicio de cómputo.

El criterio real de parada es `val_loss` y no `val_acc` porque la loss captura la incertidumbre del modelo, mientras que accuracy puede estar en 1.0 mientras la loss sigue siendo alta (el modelo predice correctamente pero con demasiada confianza).

---

## 9. Métricas

### Por qué val_acc=1.0 puede ser una trampa

`val_acc=1.0` con `val_loss=0.4504` en época 14 es exactamente la señal de alarma:

- **Accuracy=1.0:** el modelo clasifica correctamente TODAS las imágenes de validación
- **Loss=0.4504:** pero la loss no es 0. Esto indica que el modelo está seguro y correcto, pero la loss sigue siendo no-nula debido al label_smoothing (los targets nunca son 0 o 1 exacto)

El problema real no es el overfitting clásico (train baja, val sube). Es **overfitting al dominio**: tanto train como val son imágenes de PlantVillage con las mismas características de fondo controlado. El modelo aprendió perfectamente ese dominio. La prueba real es con fotos de campo.

### Precision vs Recall vs F1: con ejemplo concreto

Supongamos que procesamos 100 imágenes donde 20 son de peronospora.

- **Precision de peronospora:** de todas las que el modelo dijo "peronospora", ¿cuántas lo eran? Alta precision = pocas falsas alarmas.
  - `precision = TP / (TP + FP)`

- **Recall de peronospora:** de todas las que realmente eran peronospora, ¿cuántas detectó? Alto recall = pocas enfermedades sin detectar.
  - `recall = TP / (TP + FN)`

- **F1:** promedio armónico de precision y recall. Un solo número que resume ambos.
  - `F1 = 2 * (precision * recall) / (precision + recall)`

**Para este proyecto:** el recall de enfermedades es más importante que la precision. Un falso negativo (no detectar peronospora) destruye la cosecha. Un falso positivo (decir que está enferma cuando está sana) solo cuesta una inspección extra.

Esto se puede ajustar con class_weights (ya lo hacemos) o con el umbral de decisión en inferencia.

### Confusion matrix: cómo leerla

```
                  Predicho
              Healthy  Oídio  Peronos.
Real Healthy    [TP]    [FP]    [FP]
     Oídio      [FN]    [TP]    [FP]
     Peronosp.  [FN]    [FP]    [TP]
```

Los números en la diagonal son los aciertos. Los fuera de diagonal son errores. El patrón de confusión revela qué clases se confunden entre sí.

Si el modelo confunde mucho healthy con peronospora (celda fila 3, col 1 alta), eso indica domain shift: las hojas sanas de campo se parecen visualmente a peronospora en el dominio de entrenamiento.

---

## 10. El problema de domain shift: la falla real

### Qué pasó exactamente con healthy2/3/4

| Imagen | Predicción | Confianza | Diagnóstico |
|--------|-----------|-----------|-------------|
| healthy.webp | Sana ✅ | 75.7% | Coincide con dominio entrenamiento |
| healthy2.webp | Peronospora ❌ | 92.1% | Foto de campo, fondo natural |
| healthy3.jpg | Oídio ❌ | 75.2% | Foto de campo, iluminación diferente |
| healthy4.jpg | Peronospora ❌ | 67.3% | Foto de campo |

La hipótesis más probable (basada en los archivos del dataset):

**healthy (entrenamiento)** viene principalmente de PlantVillage (`Mt.N.V_HL` en los nombres de archivo = Mount Nittany Vineyard, la fuente de PlantVillage). Características: fondo neutro controlado, iluminación uniforme, hoja individual centrada, bordes definidos.

**healthy2/3/4 (prueba)** son fotos de campo real: fondo con otras plantas, luz solar variable, múltiples hojas en el cuadro, posible subexposición o sobreexposición.

El modelo aprendió que "hoja sana = fondo gris + iluminación controlada + hoja aislada". Cuando ve una hoja sana en contexto natural, las features del fondo y la iluminación "activan" patrones que el modelo asocia con las enfermedades.

**Por qué 92.1% de confianza:** el modelo no sabe que está en territorio desconocido. Softmax siempre produce probabilidades que suman 1 — si los tres logits son igualmente "raros", igual elige uno con alta confianza. No hay concepto de "no sé, esto no parece ninguna de las tres clases".

### La analogía del médico

Imaginá a un médico que entrenó durante años únicamente con fotos de dermatología de libro de texto: fondos blancos, iluminación de laboratorio, dermoscopio de última generación, fotos siempre del mismo ángulo.

Este médico tendrá 100% de accuracy en el examen (las fotos del examen son del mismo libro de texto). Pero si en el mundo real le mostrás una foto tomada con celular por un paciente en el baño, con luz amarilla, desde un ángulo raro, el diagnóstico puede fallar.

No porque sea un mal médico — sino porque nunca vio ese tipo de presentación visual.

### Cómo detectarlo antes de que pase

Agregar métricas **por clase** en cada época de validación:
```python
# En validate(), agregar per-class breakdown:
from sklearn.metrics import classification_report
print(classification_report(all_labels, all_preds, target_names=["healthy", "oidio", "peronospora"]))
```

Si la precision de "healthy" en val sube mientras su recall cae, el modelo está sobreajustando a las características específicas del dominio de healthy.

### Cómo arreglarlo: datos > todo

**Opción 1 (la correcta): agregar fotos de hojas sanas de campo real**

El modelo necesita ver hojas sanas en las mismas condiciones que las fotos de prueba. Con 100-200 fotos de campo en el training set de healthy, el problema debería reducirse drásticamente. No hace falta re-entrenar desde cero — se puede hacer fine-tuning sobre el modelo existente con el nuevo dato.

**Opción 2: augmentation más agresivo para healthy**

Agregar transforms que simulen condiciones de campo:
```python
# Fondo más complejo
transforms.RandomGrayscale(p=0.1),
# Iluminación más variable
transforms.ColorJitter(brightness=0.4, contrast=0.4, saturation=0.3, hue=0.1),
# Simular diferentes condiciones
transforms.RandomPerspective(distortion_scale=0.3, p=0.3),
```

**Opción 3: mixup/cutmix** — mezcla sintética de imágenes de diferentes fuentes. Puede ayudar a la generalización pero no reemplaza tener datos reales.

**El orden de prioridad:** datos reales > augmentation > nada. No hay truco de arquitectura o hiperparámetro que reemplace tener el dominio correcto en los datos de entrenamiento.

---

## 11. Inferencia

### model.eval() y torch.no_grad()

Estos dos son obligatorios en cualquier inferencia:

```python
model.eval()          # 1
with torch.no_grad(): # 2
    logits = model(image)
```

**`model.eval()`:** cambia el comportamiento de dos capas:
- **Dropout:** en modo train, desactiva neuronas aleatoriamente. En eval, las deja todas activas (y escala los pesos compensatoriamente). Sin `eval()`, cada predicción sería diferente porque dropout es random.
- **BatchNorm:** en train, usa las estadísticas del batch actual. En eval, usa las estadísticas acumuladas durante el training (running_mean, running_var). Sin `eval()`, un batch de 1 imagen tendría estadísticas de BatchNorm inútiles (la media de un solo dato no tiene sentido estadístico).

**`torch.no_grad()`:** desactiva el cálculo del grafo de gradientes. En entrenamiento, PyTorch guarda todos los cálculos intermedios para poder hacer backward(). En inferencia no necesitamos backward → ahorra ~50% de memoria y es ~30% más rápido.

### Softmax: cómo transforma logits en probabilidades

El modelo produce **logits**: números crudos sin restricción, como `[2.1, 0.3, -0.8]`.

Softmax los transforma en probabilidades que suman exactamente 1:

```
P(clase_i) = exp(logit_i) / sum(exp(logit_j) para todo j)

P(healthy)     = exp(2.1) / (exp(2.1) + exp(0.3) + exp(-0.8)) = 8.17 / 10.05 = 0.81
P(oidio)       = exp(0.3) / 10.05 = 0.19
P(peronospora) = exp(-0.8) / 10.05 = 0.05
```

El `exp()` garantiza que todos los valores son positivos. La división por la suma garantiza que suman 1.

**Qué significa "92.1% peronospora":** significa que los logits del modelo para esa imagen producen, después de softmax, que peronospora tiene el 92.1% del "peso total". NO significa que el modelo está 92.1% seguro de haber acertado. Es solo una medida relativa de cuánto prefiere esa clase sobre las otras. En el caso del domain shift, el modelo puede estar "seguro" y equivocado porque los logits de las tres clases son altos para el dominio desconocido.

---

## 12. Checkpoints

### Qué guarda state_dict

```python
torch.save({
    "epoch":            epoch,
    "model_state_dict": model.state_dict(),     # todos los pesos del modelo
    "optimizer_state":  optimizer.state_dict(), # momentos de Adam
    "val_loss":         val_loss,
    "val_acc":          val_acc,
    "train_loss":       train_loss,
    "train_acc":        train_acc,
    "model_name":       MODEL_NAME,
}, BEST_MODEL_PATH)
```

**`model.state_dict()`:** un diccionario de `{nombre_capa: tensor_de_pesos}`. Contiene TODOS los parámetros del modelo (pesos y biases de cada capa Linear, parámetros de BatchNorm, etc.). Esto es lo mínimo necesario para reconstruir el modelo y hacer inferencia.

**`optimizer.state_dict()`:** guarda los momentos de AdamW (el promedio móvil de gradientes y gradientes al cuadrado). Sin esto, si retomás el training, Adam empieza "frío" y las primeras épocas son menos eficientes. No es necesario para inferencia, solo para continuar training.

### Por qué guardar best y no last

El último checkpoint (`last_model.pth`) puede estar en un estado de overfitting. Guardamos `best_model.pth` cuando `val_loss` mejora, no al final.

El training puede tener este patrón:
```
Época 14: val_loss=0.2101  ← guardamos best
Época 15: val_loss=0.2890  (empeoró)
Época 16: val_loss=0.3100  (peor aún)
... early stopping en época 21
```
El último modelo (época 21) es peor que el de época 14. Siempre usar `best_model.pth` para inferencia.

### Cómo cargar y continuar training

```python
checkpoint = torch.load("checkpoints/best_model.pth", map_location=device)

model = build_model(model_name=checkpoint["model_name"])
model.load_state_dict(checkpoint["model_state_dict"])

optimizer = optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
optimizer.load_state_dict(checkpoint["optimizer_state"])

start_epoch = checkpoint["epoch"] + 1
best_val_loss = checkpoint["val_loss"]
```

Esto restaura el modelo Y el estado del optimizador, por lo que el entrenamiento continúa exactamente donde lo dejó, incluyendo los momentos acumulados de AdamW.

---

## 13. Próximos pasos

### El orden correcto de mejoras

La regla de oro del ML aplicado: **datos > arquitectura > hiperparámetros**

1. **Primero: arreglar los datos** — el domain shift es el problema principal. No hay hiperparámetro que lo solucione. Necesitás fotos de hojas sanas en condiciones de campo real.

2. **Segundo: si los datos no alcanzan, augmentation agresivo** — especialmente para simular las condiciones que faltan (fondos naturales, variabilidad de iluminación).

3. **Último: hiperparámetros** — cambiar lr, dropout, scheduler, etc. Solo tiene sentido cuando los datos son correctos.

### Qué imágenes agregar para arreglar healthy

Específicamente para el problema diagnosticado:
- Fotos de hojas sanas de vid con fondo natural (otras hojas, tierra, parra)
- Diferentes horas del día (mañana, mediodía, tarde — el color de la luz cambia mucho)
- Fotos tomadas con celular, no con cámara profesional
- Múltiples hojas en el encuadre, no solo una
- Diferentes variedades de vid si el proyecto abarca más de una

Con 200-500 fotos de campo en healthy, el modelo debería generalizar mucho mejor.

### Test Time Augmentation (TTA)

En lugar de hacer una predicción con la imagen original, TTA hace N predicciones con variaciones de la imagen y promedia los resultados:

```python
def predict_with_tta(image_path, model, n=5):
    tta_transform = transforms.Compose([
        transforms.Resize(INPUT_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    
    img = Image.open(image_path).convert("RGB")
    predictions = []
    
    for _ in range(n):
        # Aplicar flip random
        img_aug = transforms.RandomHorizontalFlip(p=0.5)(img)
        tensor = tta_transform(img_aug).unsqueeze(0)
        with torch.no_grad():
            logits = model(tensor.to(device))
            probs = F.softmax(logits, dim=1)
        predictions.append(probs)
    
    # Promediar las N predicciones
    avg_probs = torch.stack(predictions).mean(dim=0)
    return avg_probs
```

TTA reduce el impacto de orientaciones adversariales. Con 5-10 augmentaciones en inferencia, el accuracy en test suele subir 1-3%. Es gratis en términos de datos — solo cuesta tiempo de inferencia.

### Grad-CAM: ver qué mira el modelo

Grad-CAM (Gradient-weighted Class Activation Mapping) genera un mapa de calor sobre la imagen mostrando qué regiones activaron más la predicción.

```python
# Instalación: pip install grad-cam
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image

# Para EfficientNet-B0, la capa target es la última del backbone
target_layers = [model.backbone.features[-1]]

cam = GradCAM(model=model, target_layers=target_layers)
grayscale_cam = cam(input_tensor=image_tensor)
visualization = show_cam_on_image(rgb_img, grayscale_cam[0], use_rgb=True)
```

Esto permite **diagnosticar** el domain shift visualmente: si el mapa de calor para una hoja sana mal clasificada muestra activación en el fondo (en vez de en la hoja), confirma que el modelo está mirando lo que no debe.

Es también una herramienta poderosa para presentaciones y papers: en vez de decir "el modelo funciona", podés mostrar exactamente qué partes de la hoja detectó como diagnósticas.

---

## Apéndice: valores de referencia del código

| Hiperparámetro | Valor | Archivo |
|----------------|-------|---------|
| Modelo | EfficientNet-B0 | `config.py:MODEL_NAME` |
| Imágenes de entrada | 224×224 RGB | `config.py:INPUT_SIZE` |
| Batch size | 64 | `config.py:BATCH_SIZE` |
| Épocas máximas | 30 | `config.py:NUM_EPOCHS` |
| Learning rate | 1e-4 | `config.py:LEARNING_RATE` |
| Weight decay | 1e-4 | `config.py:WEIGHT_DECAY` |
| Label smoothing | 0.1 | `config.py:LABEL_SMOOTHING` |
| Early stopping patience | 7 | `config.py:EARLY_STOPPING_PATIENCE` |
| LR scheduler patience | 3 | `config.py:LR_SCHEDULER_PATIENCE` |
| LR scheduler factor | 0.5 | `config.py:LR_SCHEDULER_FACTOR` |
| Splits | 70/15/15 | `config.py:TRAIN/VAL/TEST_RATIO` |
| Random seed | 42 | `config.py:RANDOM_SEED` |
| Dropout head | 0.3 + 0.2 | `model.py:VidLeafClassifier` |
| HFlip probability | 0.5 | `config.py:AUGMENTATION_CONFIG` |
| VFlip probability | 0.3 | `config.py:AUGMENTATION_CONFIG` |
| RandomErasing prob | 0.1 | `config.py:AUGMENTATION_CONFIG` |
| Gradient clip max_norm | 1.0 | `train.py:train_one_epoch` |

---

*Documento generado el 2026-05-08. Basado en el código real del proyecto DetectVID.*
