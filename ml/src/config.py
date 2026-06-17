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
# IMPORTANTE: la carpeta se llama "Datasets" con D mayúscula
# En local: ../Datasets/  |  En Colab: se clona o monta en /content/Datasets/
DATASET_ROOT = PROJECT_ROOT.parent / "Datasets"

# Cache de imágenes pre-procesadas (dentro del proyecto, no toca ../Datasets)
# Primera ejecución: lee las imágenes originales, las redimensiona a 224x224,
# las guarda como tensores .pt. Ejecuciones siguientes: carga directo → ~3x más rápido.
# Cache fuera de iCloud — evita que iCloud sincronice tensores .pt mientras se escriben
# (iCloud sincronizando = 10x más lento en escritura). /var/folders es temp del sistema,
# no toca iCloud y sobrevive reinicios de sesión (pero no de máquina).
CACHE_DIR = PROJECT_ROOT / "cache"

# ─── W&B (Weights & Biases) ───────────────────────────────────────────────────
#
# Sistema de tracking de experimentos. Registra métricas, hiperparámetros
# y artifacts de cada run en la nube.
#
# Configuración:
#   1. Instalar: pip install wandb
#   2. Autenticarse: wandb login  (solo la primera vez)
#   3. WANDB_ENTITY: tu usuario de W&B (None = usa el default configurado)

WANDB_PROJECT = "detectvid"
WANDB_ENTITY  = None   # Completar con tu usuario si querés especificarlo explícitamente

# ─── Dimensiones de experimento ───────────────────────────────────────────────
#
# Estas variables controlan QUÉ experimento se corre. Se sobreescriben
# desde experiments.py para cada run. Los defaults acá son el baseline.
#
# DATASET_MODE: qué clases/fuentes incluir
#   "3cls_no_zenodo"  → solo originales (healthy, oidio, peronospora). Baseline.
#   "3cls_zenodo"     → originales + zenodo, 3 clases
#   "4cls_zenodo"     → originales + zenodo, 4 clases (agrega "others")
#   "4cls_closeup"           → solo Datasets/<clase>/closeup/<fuente>, dominio campo
#   "4cls_field_curated"     → fuentes close-up por nombre, excluye distante/flat/grapes
#   "4cls_field_broad_others"→ curated + gvlid_* solo en others para comparar
#
# SPLIT_MODE: cómo manejar los splits del zenodo
#   None              → split 70/15/15 sobre todo el pool (para 3cls_no_zenodo)
#   "split_respected" → respeta la división train/val que viene del zenodo
#   "split_mixed"     → mezcla train+val del zenodo y hace split 70/15/15 aleatorio
#
# BALANCING_MODE: cómo manejar el desbalance de clases
#   "weighted_full"   → todas las imágenes, con class_weights en CrossEntropyLoss
#   "undersampled"    → submuestrea healthy al nivel de la clase minoritaria

DATASET_MODE   = "4cls_zenodo"
SPLIT_MODE     = "split_respected"
BALANCING_MODE = "weighted_full"

# ─── Subdirectorios por clase ─────────────────────────────────────────────────
#
# Incluye tanto los originales como los del zenodo (preparados por prepare_zenodo.py).
# Las rutas del zenodo se usan según DATASET_MODE y SPLIT_MODE.

CLASS_DIRS = {
    # Originales
    "healthy":     DATASET_ROOT / "healthy",
    "oidio":       DATASET_ROOT / "oidio",
    "peronospora": DATASET_ROOT / "peronospora",
    "others":      DATASET_ROOT / "otros",

    # Zenodo — vive dentro de cada carpeta de clase (sin trato especial)
    "zenodo_healthy_train":      DATASET_ROOT / "healthy"      / "zenodo_healthy" / "zenodo_healthy_train",
    "zenodo_healthy_val":        DATASET_ROOT / "healthy"      / "zenodo_healthy" / "zenodo_healthy_val",
    "zenodo_oidio_train":        DATASET_ROOT / "oidio"        / "zenodo_oidio"   / "zenodo_oidio_train",
    "zenodo_oidio_val":          DATASET_ROOT / "oidio"        / "zenodo_oidio"   / "zenodo_oidio_val",
    "zenodo_peronospora_train":  DATASET_ROOT / "peronospora"  / "zenodo_peronospora" / "zenodo_peronospora_train",
    "zenodo_peronospora_val":    DATASET_ROOT / "peronospora"  / "zenodo_peronospora" / "zenodo_peronospora_val",
    "zenodo_others_train":       DATASET_ROOT / "otros"        / "zenodo_others"  / "zenodo_others_train",
    "zenodo_others_val":         DATASET_ROOT / "otros"        / "zenodo_others"  / "zenodo_others_val",
}

# ─── Mapeo de clases ─────────────────────────────────────────────────────────
#
# El mapeo clase → índice numérico es esencial para que el modelo trabaje
# con tensores de enteros en vez de strings. El orden es FIJO para que los
# checkpoints sean reproducibles entre ejecuciones.
#
# Para 4 clases se agrega "others" al final (índice 3), así los índices
# 0-2 son compatibles con los modelos de 3 clases.

CLASS_TO_IDX_3 = {
    "healthy":     0,
    "oidio":       1,
    "peronospora": 2,
}

CLASS_TO_IDX_4 = {
    "healthy":     0,
    "oidio":       1,
    "peronospora": 2,
    "others":      3,
}

# Se asigna dinámicamente según DATASET_MODE (ver abajo)
CLASS_TO_IDX = CLASS_TO_IDX_4 if DATASET_MODE.startswith("4cls") else CLASS_TO_IDX_3
IDX_TO_CLASS = {v: k for k, v in CLASS_TO_IDX.items()}

# Nombre humano para cada clase (para reportes, plots y UI)
CLASS_DISPLAY_NAMES = {
    "healthy":     "Sana",
    "oidio":       "Oídio (Powdery Mildew)",
    "peronospora": "Peronospora (Downy Mildew)",
    "others":      "Otras enfermedades",
}

# ─── Número de clases ─────────────────────────────────────────────────────────
#
# Se calcula dinámicamente según DATASET_MODE para que model.py y train.py
# no tengan que importar lógica del dataset.

NUM_CLASSES = 4 if DATASET_MODE.startswith("4cls") else 3

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

# Semilla fija global para reproducibilidad.
# Esta semilla debe quedar registrada en cada experimento y en los splits exportados.
RANDOM_SEED = 42

# Splits persistentes: todos los experimentos con el mismo dataset_mode/split_mode
# leen los mismos CSV en vez de volver a dividir aleatoriamente.
SPLITS_DIR = PROJECT_ROOT / "splits"
SPLIT_VERSION = "v3"
PERSISTENT_SPLITS_ENABLED = True

# Auditoría liviana de leakage al crear splits.
# - SHA256 detecta archivos idénticos aunque tengan nombres distintos.
# - aHash detecta candidatos visualmente muy parecidos.
SPLIT_AUDIT_HASH_IMAGES = True
SPLIT_AUDIT_SIMILAR_IMAGES = True

# ─── Modelo ──────────────────────────────────────────────────────────────────
#
# Transfer Learning: usamos un modelo PRE-ENTRENADO en ImageNet (1.2M imágenes,
# 1000 clases) y lo adaptamos a nuestro problema (3-4 clases de hojas de vid).
#
# ¿Por qué funciona? Las capas iniciales de una CNN aprenden patrones universales
# (bordes, texturas, formas) que son útiles para CUALQUIER tarea de clasificación
# de imágenes. Solo necesitamos re-entrenar las capas finales para que aprendan
# a distinguir nuestras clases específicas.
#
# Opciones de modelo:
#   "efficientnet_b0" → Mejor accuracy/parámetro. 5.3M params. Default.
#   "resnet18"        → Más simple, más rápido en MPS. 11.7M params pero
#                        inference más rápida por arquitectura más GPU-friendly.
#                        Es el modelo usado en el notebook Clase_VC de la materia.

MODEL_NAME       = "efficientnet_b0"    # Cambiar a "resnet18" si querés más velocidad
PRETRAINED       = True                  # Usar pesos de ImageNet (transfer learning)
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
NUM_EPOCHS      = 15
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
    "local_sun_glare_prob": 0.5,
    "random_erasing_prob": 0.1,
    "random_rotation_degrees": 45,
    "random_resized_crop_scale": (0.7, 1.0),
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

EXPERIMENT_ID     = os.environ.get("MODEL_EXPERIMENT_ID", "exp44_4cls_field_eff_quality_aug")
CHECKPOINTS_DIR   = Path(os.environ.get("CHECKPOINTS_DIR", PROJECT_ROOT / "checkpoints"))
MODEL_CHECKPOINT_OVERRIDE = os.environ.get("MODEL_CHECKPOINT_PATH")
BEST_MODEL_PATH   = Path(MODEL_CHECKPOINT_OVERRIDE) if MODEL_CHECKPOINT_OVERRIDE else CHECKPOINTS_DIR / f"{EXPERIMENT_ID}_best.pth"
LAST_MODEL_PATH   = CHECKPOINTS_DIR / "last_model.pth"

# ─── Resultados ──────────────────────────────────────────────────────────────

RESULTS_DIR       = PROJECT_ROOT / "results"

# ─── Dispositivo ─────────────────────────────────────────────────────────────

import torch
DEVICE = (
    "cuda"  if torch.cuda.is_available()  else
    "mps"   if torch.backends.mps.is_available() else
    "cpu"
)

# ─── OVERRIDES NOCTURNOS ─────────────────────────────────────────────────────
import os
override = os.environ.get("OVERRIDE_EXP", None)
if override == "exp28":
    EXPERIMENT_ID = "exp28_4cls_agresivo_mild_color_clean"
    NUM_EPOCHS = 50
    AUGMENTATION_CONFIG = {
        "horizontal_flip_prob": 0.5,
        "vertical_flip_prob": 0.3,
        "color_jitter": {"brightness": 0.1, "contrast": 0.1, "saturation": 0.1, "hue": 0.02},
        "random_resized_crop_scale": (0.4, 1.0),
        "random_erasing_prob": 0.1,
    }
elif override == "exp29":
    EXPERIMENT_ID = "exp29_4cls_agresivo_local_sun_clean"
    NUM_EPOCHS = 50
    AUGMENTATION_CONFIG = {
        "horizontal_flip_prob": 0.5,
        "vertical_flip_prob": 0.3,
        "local_sun_glare_prob": 0.5,
        "random_resized_crop_scale": (0.4, 1.0),
        "random_erasing_prob": 0.1,
    }
elif override == "exp30":
    EXPERIMENT_ID = "exp30_4cls_agresivo_blur_clean"
    NUM_EPOCHS = 50
    AUGMENTATION_CONFIG = {
        "horizontal_flip_prob": 0.5,
        "vertical_flip_prob": 0.3,
        "random_resized_crop_scale": (0.5, 1.0),
        "gaussian_blur_prob": 0.5,
    }
elif override == "exp31":
    EXPERIMENT_ID = "exp31_4cls_agresivo_no_color_clean"
    NUM_EPOCHS = 35
    AUGMENTATION_CONFIG = {
        "horizontal_flip_prob": 0.5,
        "vertical_flip_prob": 0.3,
        "random_resized_crop_scale": (0.5, 1.0),
    }

BEST_MODEL_PATH   = Path(MODEL_CHECKPOINT_OVERRIDE) if MODEL_CHECKPOINT_OVERRIDE else CHECKPOINTS_DIR / f"{EXPERIMENT_ID}_best.pth"

# ─── Hiperparámetros de Entrenamiento ────────────────────────────────────────

MAX_EPOCHS   = 35
