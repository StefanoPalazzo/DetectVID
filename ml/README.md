# DetectVID — Clasificador de Enfermedades en Hojas de Vid

> Sistema de visión computacional para detectar enfermedades en hojas de vid usando Transfer Learning con EfficientNet-B0.

---

## ¿Qué hace este sistema?

Dado una fotografía de una hoja de vid, el modelo predice una de tres categorías:

| Clase | Enfermedad | Descripción |
|-------|-----------|-------------|
| ✅ **Healthy** | Sana | La hoja no presenta síntomas de enfermedad |
| 🚨 **Oídio** | Powdery Mildew | *Erysiphe necator* — manchas blancas pulverulentas |
| 🚨 **Peronospora** | Downy Mildew | *Plasmopara viticola* — manchas amarillas aceitosas |

---

## Estructura del proyecto

```
DetectVID/
├── src/
│   ├── config.py       ← Todos los hiperparámetros y rutas centralizados
│   ├── dataset.py      ← Carga, splits, transforms y DataLoaders
│   ├── model.py        ← Arquitectura EfficientNet-B0 adaptada
│   ├── train.py        ← Loop de entrenamiento con early stopping
│   ├── evaluate.py     ← Evaluación completa sobre test set
│   └── predict.py      ← Inferencia sobre imágenes individuales o directorios
├── checkpoints/        ← Modelos guardados durante el entrenamiento
│   ├── best_model.pth  ← Mejor modelo (menor val_loss)
│   └── last_model.pth  ← Estado final del entrenamiento
├── results/            ← Métricas, gráficos y reportes
├── docs/
│   ├── ARCHITECTURE.md ← Decisiones técnicas con justificación y alternativas
│   └── EXPERIMENTS.md  ← Registro de experimentos y resultados
├── requirements.txt
└── README.md
```

El dataset vive **fuera del repo** en `../datasets/` y no se modifica:
```
../datasets/
├── healthy/        ← 6,369 imágenes (hojas sanas)
├── oidio/          ←   978 imágenes (Powdery Mildew)
├── peronospora/    ← 2,659 imágenes (Downy Mildew)
└── otros/          ← ignorado por este modelo
```

---

## Instalación

```bash
# Clonar el repo (si aplica)
cd DetectVID/

# Crear entorno virtual (recomendado)
python -m venv .venv
source .venv/bin/activate   # Linux/Mac
# .venv\Scripts\activate    # Windows

# Instalar dependencias
pip install -r requirements.txt
```

**Requisitos de sistema:**
- Python 3.10+
- GPU recomendada (NVIDIA con CUDA, o Apple Silicon con MPS)
- ~2 GB de espacio en disco para el modelo y resultados

---

## Uso

### 1. Entrenar el modelo

```bash
python src/train.py
```

El entrenamiento:
- Escanea automáticamente los datasets en `../datasets/`
- Aplica split 70/15/15 estratificado
- Usa WeightedRandomSampler para compensar el desbalance de clases
- Guarda el mejor modelo en `checkpoints/best_model.pth`
- Implementa early stopping (patience=7)

**Tiempo estimado:** 15–45 min en GPU, 2–4 horas en CPU.

---

### 2. Evaluar el modelo

```bash
python src/evaluate.py
# o con checkpoint específico:
python src/evaluate.py --checkpoint checkpoints/best_model.pth
```

Genera en `results/`:
- `confusion_matrix.png` — Matriz de confusión (conteos y normalizada)
- `roc_curves.png` — Curvas ROC One-vs-Rest por clase
- `training_curves.png` — Loss y accuracy por época
- `metrics.json` — Todas las métricas en formato JSON

---

### 3. Predecir sobre nuevas imágenes

```bash
# Una imagen
python src/predict.py --image /ruta/a/hoja.jpg

# Un directorio completo
python src/predict.py --dir /ruta/al/directorio/

# Con checkpoint específico
python src/predict.py --image hoja.jpg --checkpoint checkpoints/best_model.pth

# Salida JSON (para integraciones)
python src/predict.py --image hoja.jpg --json
```

**Ejemplo de salida:**
```
──────────────────────────────────────────────────
  Imagen:      Downy_Mildew_0042.jpg
  Diagnóstico: 🚨 ENFERMA
  Predicción:  Peronospora (Downy Mildew)
  Confianza:   94.7%

  Probabilidades:
    Sana                             [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  2.1%
    Oídio (Powdery Mildew)           [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  3.2%
    Peronospora (Downy Mildew)       [████████████████████████████░░] 94.7%
──────────────────────────────────────────────────
```

---

## Agregar nuevas imágenes

El sistema está diseñado para escalar. Cuando agregues más imágenes:

1. **Colocarlas en** `../datasets/healthy/`, `../datasets/oidio/` o `../datasets/peronospora/`
   - Se admiten subdirectorios dentro de cada clase
   - Extensiones soportadas: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.tiff`, `.webp`

2. **Re-entrenar** con `python src/train.py`
   - El sistema escanea todos los subdirectorios automáticamente
   - No se requiere ningún cambio en el código

**Nota:** El split es reproducible con `RANDOM_SEED=42` en `config.py`. Si querés un split diferente, cambiar la semilla y re-entrenar.

---

## Decisiones técnicas

Ver **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** para:
- Por qué EfficientNet-B0 y no ResNet-18, ResNet-50, MobileNet o ViT
- Por qué Transfer Learning desde ImageNet
- Estrategia de fine-tuning y por qué no feature extraction puro
- Cómo se maneja el desbalance de clases
- Justificación de cada hiperparámetro

Ver **[docs/EXPERIMENTS.md](docs/EXPERIMENTS.md)** para:
- Registro de experimentos realizados y sus resultados
- Experimentos futuros planificados
- Cómo interpretar las métricas y señales de alerta

---

## Configuración

Todos los hiperparámetros están en `src/config.py`. Los más importantes:

```python
BATCH_SIZE       = 32
LEARNING_RATE    = 1e-4
NUM_EPOCHS       = 30
LABEL_SMOOTHING  = 0.1
EARLY_STOPPING_PATIENCE = 7
```

Para cambiar rutas del dataset:
```python
DATASET_ROOT = PROJECT_ROOT.parent / "datasets"  # ruta relativa default
# o ruta absoluta:
DATASET_ROOT = Path("/ruta/absoluta/a/tus/datasets")
```

---

## Dispositivos soportados

El sistema detecta automáticamente el mejor dispositivo disponible:

| Dispositivo | Prioridad | Notas |
|-------------|-----------|-------|
| NVIDIA GPU (CUDA) | 1° | Más rápido |
| Apple Silicon (MPS) | 2° | M1/M2/M3 Mac |
| CPU | 3° | Lento pero funciona |

Para forzar un dispositivo específico:
```bash
python src/predict.py --image hoja.jpg --device cpu
```

---

## Referencias

- Tan, M., & Le, Q. (2019). *EfficientNet: Rethinking Model Scaling for Convolutional Neural Networks*. ICML 2019.
- Mohanty, S. P., Hughes, D. P., & Salathé, M. (2016). *Using Deep Learning for Image-Based Plant Disease Detection*. Frontiers in Plant Science.
- Loshchilov, I., & Hutter, F. (2019). *Decoupled Weight Decay Regularization*. ICLR 2019.

---

*Para reportar issues o proponer mejoras, ver [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md)*
