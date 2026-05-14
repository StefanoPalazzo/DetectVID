"""
config.py — Configuración centralizada de hiperparámetros y rutas
═══════════════════════════════════════════════════════════════════

Todos los parámetros del experimento viven aquí. Esto permite:
- Reproducibilidad: un solo lugar para cambiar parámetros
- Trazabilidad: queda registrado qué configuración produjo qué resultado
- Separación de concerns: el código no tiene magic numbers hardcodeados

Referencia: patrón inspirado en los notebooks de la materia (Clase_VC, Clasificación_COMPLETO),
            adaptado a un proyecto estructurado en módulos.
"""

import os
import platform
from pathlib import Path

# ─── Rutas ───────────────────────────────────────────────────────────────────

# Raíz del proyecto (este archivo está en src/, sube un nivel)
PROJECT_ROOT = Path(__file__).parent.parent

# Dataset original (NO se modifica — es la "fuente de verdad")
# En local: ../datasets/  |  En Colab: se clona o monta en /content/datasets/
DATASET_ROOT = PROJECT_ROOT.parent / "datasets"

# Cache de imágenes pre-procesadas (dentro del proyecto, no toca ../datasets)
# Primera ejecución: lee las imágenes originales, las redimensiona a 224x224,
# las guarda como tensores .pt. Ejecuciones siguientes: carga directo → ~3x más rápido.
CACHE_DIR = PROJECT_ROOT / "data" / "cache"

# Subdirectorios por clase (las 3 enfermedades/estados de la hoja de vid)
CLASS_DIRS = {
    "healthy":     DATASET_ROOT / "healthy",
    "oidio":       DATASET_ROOT / "oidio",
    "peronospora": DATASET_ROOT / "peronospora",
}

# ─── Mapeo de clases ─────────────────────────────────────────────────────────
#
# El mapeo clase → índice numérico es esencial para que el modelo trabaje
# con tensores de enteros en vez de strings. El orden es FIJO para que los
# checkpoints sean reproducibles entre ejecuciones.

CLASS_TO_IDX = {
    "healthy":     0,
    "oidio":       1,
    "peronospora": 2,
}

IDX_TO_CLASS = {v: k for k, v in CLASS_TO_IDX.items()}

# Nombre humano para cada clase (para reportes, plots y UI)
CLASS_DISPLAY_NAMES = {
    "healthy":     "Sana",
    "oidio":       "Oídio (Powdery Mildew)",
    "peronospora": "Peronospora (Downy Mildew)",
}

# ─── Splits ──────────────────────────────────────────────────────────────────
#
# Distribución del dataset:
# - 70% entrenamiento  → el modelo aprende de estos datos
# - 15% validación     → se usa DURANTE el training para monitorear overfitting
# - 15% test           → evaluación FINAL honesta (se toca UNA sola vez)
#
# ¿Por qué 70/15/15 y no 80/10/10?
# Con ~10k imágenes, 15% = ~1500 imágenes por split es suficiente para
# métricas estadísticamente significativas. Con 10% tendríamos ~1000 que
# también funciona, pero 15% da más confianza en datasets desbalanceados.

TRAIN_RATIO = 0.70
VAL_RATIO   = 0.15
TEST_RATIO  = 0.15

# Semilla fija para reproducibilidad — misma semilla = mismos splits siempre
RANDOM_SEED = 42

# ─── Modelo ──────────────────────────────────────────────────────────────────
#
# Transfer Learning: usamos un modelo PRE-ENTRENADO en ImageNet (1.2M imágenes,
# 1000 clases) y lo adaptamos a nuestro problema (3 clases de hojas de vid).
#
# ¿Por qué funciona? Las capas iniciales de una CNN aprenden patrones universales
# (bordes, texturas, formas) que son útiles para CUALQUIER tarea de clasificación
# de imágenes. Solo necesitamos re-entrenar las capas finales para que aprendan
# a distinguir nuestras 3 clases específicas.
#
# Opciones de modelo:
#   "efficientnet_b0" → Mejor accuracy/parámetro. 5.3M params. Default.
#   "resnet18"        → Más simple, más rápido en MPS. 11.7M params pero
#                        inference más rápida por arquitectura más GPU-friendly.
#                        Es el modelo usado en el notebook Clase_VC de la materia.

MODEL_NAME       = "efficientnet_b0"    # Cambiar a "resnet18" si querés más velocidad
PRETRAINED       = True                  # Usar pesos de ImageNet (transfer learning)
NUM_CLASSES      = 3                     # healthy, oidio, peronospora
FREEZE_BACKBONE  = False                 # False = fine-tuning completo (re-entrena todo)
                                         # True  = feature extraction (solo entrena el head)

# ─── Imagen ──────────────────────────────────────────────────────────────────
#
# Tanto EfficientNet-B0 como ResNet18 esperan imágenes de 224x224 pixels, RGB.
# Las imágenes originales del dataset son 256x256, así que el resize es mínimo.

INPUT_SIZE = (224, 224)
N_CHANNELS = 3  # RGB

# Estadísticas de normalización de ImageNet.
# Se usan porque el backbone fue preentrenado con estas estadísticas.
# Si no normalizamos igual, las features del backbone no tienen sentido.
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

# ─── Entrenamiento ────────────────────────────────────────────────────────────
#
# BATCH_SIZE = 64
# ¿Por qué 64 y no 16 o 128?
# - 16 es MUY chico: la GPU queda ociosa entre batches (overhead de dispatch > compute).
#   Esto es exactamente lo que causaba los 12s/batch con batch=16.
# - 128 puede dar Out of Memory en Colab Free (15GB VRAM) con EfficientNet-B0.
# - 64 es el sweet spot: satura la GPU sin explotar la memoria.
#   Es lo que usa el notebook Clase_VC de la materia.
#
# LEARNING_RATE = 1e-4
# ¿Por qué tan bajo?
# Porque hacemos FINE-TUNING sobre un backbone ya entrenado. Si usáramos lr=1e-3
# (el default de Adam), los gradientes destruirían las features aprendidas en ImageNet.
# Regla de oro: fine-tuning → lr 10-100x menor que training from scratch.

BATCH_SIZE      = 64
NUM_EPOCHS      = 30
LEARNING_RATE   = 1e-4
WEIGHT_DECAY    = 1e-4     # Regularización L2 — penaliza pesos grandes para evitar overfitting
LABEL_SMOOTHING = 0.1      # Suaviza las etiquetas (0→0.033, 1→0.967). Reduce overconfidence.

# Early stopping: detiene el training si val_loss no mejora en N épocas.
# Previene overfitting: si el modelo ya no mejora en validación, seguir
# entrenando solo hace que memorice el training set.
EARLY_STOPPING_PATIENCE = 7
EARLY_STOPPING_DELTA    = 0.001

# LR Scheduler: ReduceLROnPlateau
# Reduce el learning rate cuando val_loss deja de mejorar.
# Es como ir más despacio cuando te acercás al objetivo.
LR_SCHEDULER_PATIENCE = 3     # Épocas sin mejora antes de reducir LR
LR_SCHEDULER_FACTOR   = 0.5   # Factor de reducción (LR = LR * 0.5)
LR_SCHEDULER_MIN_LR   = 1e-7  # Piso mínimo del LR

# ─── Data Augmentation ───────────────────────────────────────────────────────
#
# Augmentation = generar variaciones artificiales de las imágenes de entrenamiento.
# Esto ayuda al modelo a generalizar porque ve la "misma" hoja en distintas
# condiciones (rotada, espejada, con diferente iluminación).
#
# SOLO se aplica al training set — val/test deben evaluarse en condiciones reales.
#
# IMPORTANTE: Usamos transforms LIVIANOS porque en MPS (Apple Silicon) los
# transforms corren en CPU y son el cuello de botella. Cada ms por imagen
# se multiplica por 7000+ imágenes por época.
#
# Transforms elegidos y por qué:
#   - RandomHorizontalFlip: las hojas no tienen orientación fija → flip es gratis (~0ms)
#   - RandomVerticalFlip: idem, una hoja fotografiada "al revés" sigue siendo oidio
#   - ColorJitter LIGHT: variaciones de luz solar/sombra en campo. Valores bajos
#     para no distorsionar los colores diagnósticos de las enfermedades.
#   - RandomErasing: simula oclusiones (gotas de agua, suciedad) con p=0.1 (raro)
#
# NO usamos (y por qué):
#   - RandomRotation: LENTO en CPU (~2ms/img). HFlip+VFlip ya cubren 4 orientaciones.
#   - RandomResizedCrop: requiere PIL Resize, lento. Resize se hace en pre-cache.

AUGMENTATION_CONFIG = {
    "horizontal_flip_prob": 0.5,
    "vertical_flip_prob":   0.3,
    "color_jitter": {
        "brightness": 0.15,
        "contrast":   0.15,
        "saturation": 0.1,
        "hue":        0.03,
    },
    "random_erasing_prob": 0.1,
}

# ─── Optimización de hardware ────────────────────────────────────────────────
#
# torch.compile() fusiona operaciones del modelo en kernels optimizados.
# En MPS (Apple Silicon) da un speedup de ~1.3-1.5x.
# En CUDA da ~1.5-2x.
# Se puede desactivar si causa problemas de compatibilidad.

# NOTA: torch.compile() en MPS tiene un bug en PyTorch 2.11 — genera shaders
# de Metal con variables fuera de scope (r0_3 undeclared). Solo activar en CUDA.
# Se resuelve en runtime (ver model.py build_model).
USE_COMPILE = False

# ─── Checkpoints ─────────────────────────────────────────────────────────────

CHECKPOINTS_DIR   = PROJECT_ROOT / "checkpoints"
BEST_MODEL_PATH   = CHECKPOINTS_DIR / "best_model.pth"
LAST_MODEL_PATH   = CHECKPOINTS_DIR / "last_model.pth"

# ─── Resultados ──────────────────────────────────────────────────────────────

RESULTS_DIR       = PROJECT_ROOT / "results"

# ─── Dispositivo ─────────────────────────────────────────────────────────────
#
# Detección automática del mejor dispositivo disponible:
# 1. CUDA (GPU NVIDIA) → más rápido, ideal en Colab
# 2. MPS (Apple Silicon GPU) → tu MacBook Pro M4 Pro
# 3. CPU → fallback, funciona pero es 5-10x más lento
#
# ¿Qué es MPS?
# Metal Performance Shaders — el framework de Apple para cómputo en GPU.
# PyTorch 2.x lo soporta nativamente. No es tan rápido como CUDA pero
# es MUCHO mejor que CPU puro.

import torch
DEVICE = (
    "cuda"  if torch.cuda.is_available()  else
    "mps"   if torch.backends.mps.is_available() else
    "cpu"
)
