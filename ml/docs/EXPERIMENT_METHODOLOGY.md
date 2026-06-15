# DetectVID — metodología de experimentos

Este documento explica la metodología REAL usada por el código actual de `/Users/stefanopalazzo/Projects/DetectVID/ml/src`.

## Quick path

1. Los modelos se entrenan con `python src/experiments.py` o `python src/train.py`.
2. El mejor checkpoint se elige por **menor validation loss**, no por mayor accuracy.
3. El **data augmentation se aplica solo al split de entrenamiento**.
4. En inferencia y evaluación se usa solo **preprocesamiento determinista** (`resize`/cache + normalización), no augmentation.

## Resumen ejecutivo

| Tema | Decisión real en el código |
|---|---|
| Tamaño de imagen | `224x224` |
| Backbones usados | `efficientnet_b0`, `resnet18`, `mobilenet_v3`, `resnet50` |
| Clases | 3 clases o 4 clases (`others`) |
| Épocas por default | `15` |
| Early stopping | paciencia `7`, delta `0.001` |
| Scheduler | `ReduceLROnPlateau`, paciencia `3`, factor `0.5` |
| Optimizer | `AdamW` |
| Loss | `CrossEntropyLoss` con `label_smoothing=0.1` y `class_weights` |
| Batch size | `64` |
| Learning rate | `1e-4` |
| Selección del mejor modelo | mínimo `val_loss` |
| Métricas finales guardadas | accuracy, macro precision/recall/F1, ROC-AUC OvR, confusion matrix |
| Regla de incertidumbre en inferencia | umbral de confianza y margen top-1 |

---

## 1. Qué se está optimizando realmente

Hay DOS niveles de evaluación y no conviene mezclarlos.

### Nivel A — entrenamiento interno
Se usa para decidir qué checkpoint guardar durante el training.

El criterio real en `/Users/stefanopalazzo/Projects/DetectVID/ml/src/train.py` es:

- guardar checkpoint cuando **baja `val_loss`**
- no cuando sube `val_acc`

### ¿Por qué se usa `val_loss` y no solo accuracy?
Porque `val_loss` es más sensible a:

- predicciones sobreconfiadas pero incorrectas
- degradación de calibración
- mejoras pequeñas aunque el accuracy no cambie

Eso es importante en este proyecto porque después querés usar:

- `others`
- `uncertain`
- y evitar diagnósticos mentirosos

Un modelo puede empatar accuracy pero tener peor calibración. En ese caso, para producto, es peor.

---

## 2. Qué métricas se usan y por qué

## Métricas internas del loop de entrenamiento
Durante cada época se registran:

- `train_loss`
- `train_acc`
- `val_loss`
- `val_acc`
- `learning_rate`

## Métricas finales sobre test set
Al final del entrenamiento, el código calcula:

- `test_acc`
- `macro precision`
- `macro recall`
- `macro F1`
- métricas por clase (`precision`, `recall`, `F1`, `support`)
- `ROC-AUC` multiclase `one-vs-rest`
- `classification_report`
- `confusion_matrix`

## Métricas de producto que importan MÁS
Para DetectVID no alcanza con accuracy global.

Las métricas que mejor representan el uso real son:

1. **Recall de healthy close-up**
   - si falla esto, el modelo sobrediagnostica enfermedad
2. **False positive rate de enfermedad sobre healthy**
   - clave para no asustar al usuario con falsos positivos
3. **Recall de oidio**
4. **Recall de peronospora**
5. **Tasa de `others`**
   - mide si el modelo sabe rechazar enfermedades no objetivo
6. **Tasa de `uncertain`**
   - mide si el filtro de seguridad está actuando demasiado o demasiado poco
7. **Accepted-only accuracy**
   - accuracy solo sobre casos que el sistema acepta como confiables

---

## 3. Cómo se arman los datasets

## Modos de dataset
El código soporta estos modos relevantes:

| `dataset_mode` | Qué hace |
|---|---|
| `3cls_no_zenodo` | originales, 3 clases |
| `3cls_zenodo` | originales + zenodo, 3 clases |
| `4cls_zenodo` | originales + zenodo, 4 clases |
| `4cls_closeup` | solo `Datasets/<clase>/closeup/<fuente>/` |
| `4cls_field_curated` | close-ups curados para producción, excluyendo fotos lejanas, fondos planos y `grapes` |
| `4cls_field_broad_others` | igual a curated pero agregando ciertos `gvlid_*` dentro de `others` para una prueba controlada |

## Estrategias de split

| `split_mode` | Qué significa |
|---|---|
| `split_mixed` | mezcla el pool disponible y hace split estratificado 70/15/15 |
| `split_respected` | respeta folders que ya vienen separados (`train`, `val`, `test`) para evitar leakage |

## Recomendación conceptual
Cuando una fuente ya viene separada en `train/val/test`, respetar ese split suele ser más honesto. Si mezclás todo, podés terminar con fotos muy parecidas del mismo origen repartidas entre train y val/test. Eso infla métricas.

---

## 4. Cómo se maneja el desbalance

Hay dos estrategias:

| Modo | Qué hace |
|---|---|
| `weighted_full` | usa todas las imágenes y compensa con pesos de clase en la loss |
| `undersampled` | submuestrea la clase mayoritaria en train |

### Importante
En este código, el undersampling:

- **solo afecta `train`**
- **no toca `val` ni `test`**

Eso está bien. Evaluar sobre una distribución artificialmente balanceada te mentiría sobre el comportamiento real.

---

## 5. Data augmentation: qué se hace y dónde se aplica

## Regla correcta
El augmentation se aplica **solo al training set**.

No se aplica a:

- validación
- test
- imágenes subidas por el usuario en inferencia

## Por qué
Porque augmentation sirve para que el modelo aprenda robustez durante entrenamiento.
No es algo que debas “imitar” después sobre la foto del usuario.

Si le aplicás augmentation en inferencia de forma ingenua:

- alterás la distribución real de la imagen
- podés destruir síntomas finos
- y encima hacés la predicción menos interpretable

## Qué sí se hace en inferencia
En `/Users/stefanopalazzo/Projects/DetectVID/ml/src/predict.py` se hace:

- resize / tensorización equivalente al pipeline de evaluación
- normalización con medias/std de ImageNet

Nada más.

## Qué augmentations existen
### Augmentation default
Configurado en `config.py`:

- `RandomResizedCrop`
- `RandomRotation`
- `RandomHorizontalFlip`
- `RandomVerticalFlip`
- `LocalSunGlare`
- `RandomErasing`

### Quality augmentation
Usado en `exp43` y `exp44`:

- flips
- color jitter suave
- glare solar local suave
- crop moderado
- blur gaussiano leve
- random erasing leve

La idea es simular condiciones de campo SIN destruir textura y color diagnóstico.

### Aggressive augmentation
Usado en `exp25`, `exp28`, `exp29`, `exp30`:

- crops más agresivos
- variantes con color leve, glare local o blur
- en algunos casos con más épocas máximas

---

## 6. Épocas reales y early stopping

## Regla general
La mayoría de los experimentos oficiales usan:

- `NUM_EPOCHS = 15`
- `EARLY_STOPPING_PATIENCE = 7`

## Excepciones
Los experimentos nocturnos agresivos (`exp28`, `exp29`, `exp30`) redefinen:

- `NUM_EPOCHS = 50`

Pero no siempre llegan a 50 porque early stopping puede cortar antes.

### Épocas efectivamente corridas
- `exp28`: 22
- `exp29`: 37
- `exp30`: 36

## Descubrimiento importante del código
En `config.py` existe `MAX_EPOCHS = 35`, pero **no controla el entrenamiento actual**.
El loop de training usa `NUM_EPOCHS`, no `MAX_EPOCHS`.

Eso significa que para documentar o cambiar épocas, la variable efectiva hoy es `NUM_EPOCHS`.

---

## 7. Reglas de seguridad en inferencia

En `/Users/stefanopalazzo/Projects/DetectVID/ml/src/predict.py` hay una decisión adicional:

- `UNCERTAIN_CONFIDENCE_THRESHOLD = 0.70`
- `UNCERTAIN_MARGIN_THRESHOLD = 0.15`

Una predicción se marca como `uncertain` si:

- la confianza top-1 es menor a `0.70`, o
- la diferencia entre top-1 y top-2 es menor a `0.15`

## Por qué esto es correcto
Porque el sistema no debería inventar un diagnóstico cuando la foto:

- no es suficientemente clara
- cae fuera del dominio de entrenamiento
- mezcla señales de varias clases

Esto es ESPECIALMENTE importante si usás un modelo de 4 clases y querés reducir falsos positivos sobre hojas sanas.

---

## 8. Qué significa “mejor modelo” en este proyecto

Hay tres definiciones distintas y conviene separarlas:

### Mejor checkpoint de entrenamiento
- el de menor `val_loss`

### Mejor experimento de benchmark interno
- el que combina buen `val_loss`, `val_acc`, gap controlado y métricas por clase

### Mejor modelo para producción
- el que mejor se comporta en hojas reales de campo y holdouts externos

Para DetectVID, el mejor para producción NO se decide solo por validation accuracy. Se decide con:

- `mis-hojas`
- recall de healthy close-up
- baja tasa de falsos positivos de enfermedad sobre healthy
- recalls separados para oidio y peronospora
- comportamiento de `others`
- y utilidad de la regla `uncertain`

---

## 9. Checklist de interpretación correcta

- [x] El mejor checkpoint se elige por `val_loss`
- [x] El augmentation es solo para train
- [x] Validación y test deben quedar sin augmentation
- [x] Las imágenes del usuario NO deben recibir augmentations de entrenamiento
- [x] `uncertain` es una decisión de inferencia, no una clase entrenada hoy
- [x] Los splits preservados son preferibles cuando la fuente ya viene separada
- [x] Las métricas internas no alcanzan sin validación externa tipo `mis-hojas`

## Siguiente lectura

- `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/EXPERIMENT_ANALYSIS.md`
