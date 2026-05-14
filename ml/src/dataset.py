"""
dataset.py — Carga, preparación y splits del dataset de hojas de vid
═══════════════════════════════════════════════════════════════════════

Pipeline de datos:
  1. Escanea directorios de cada clase → construye DataFrame (path, label)
  2. Split estratificado train/val/test (70/15/15)
  3. Pre-cache: redimensiona imágenes a 224x224 y guarda como tensores .pt
  4. DataLoader con transforms apropiados por split

¿Por qué pre-cache?
  Las imágenes originales son JPEG de ~256x256. Cada época, el DataLoader las
  abre con PIL, las convierte a RGB, las redimensiona y las transforma a tensor.
  Con 7000+ imágenes, esto es ~45-120ms por batch EN CPU (el cuello de botella).

  Con pre-cache: la primera ejecución procesa todo (~30s) y guarda tensores .pt.
  Las ejecuciones siguientes cargan directo con torch.load() → ~15ms por batch.
  Es como pre-cocinar los ingredientes antes de empezar a cocinar.

Referencia: basado en el patrón CatsDogsDataset del notebook Clase_VC,
            pero con splits estratificados (Clasificación_COMPLETO) y cache.
"""

import os
import sys
import hashlib
import pandas as pd
from pathlib import Path
from typing import Tuple, Dict, List, Optional

import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image
from sklearn.model_selection import train_test_split

from config import (
    CLASS_DIRS, CLASS_TO_IDX, IDX_TO_CLASS,
    TRAIN_RATIO, VAL_RATIO, TEST_RATIO, RANDOM_SEED,
    INPUT_SIZE, IMAGENET_MEAN, IMAGENET_STD,
    AUGMENTATION_CONFIG, BATCH_SIZE, CACHE_DIR,
)


# ─── Extensiones de imagen admitidas ─────────────────────────────────────────
VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}


# ─── Escaneo de archivos ──────────────────────────────────────────────────────

def scan_class_dir(class_name: str, class_root: Path) -> List[Dict]:
    """
    Recorre recursivamente class_root y devuelve una lista de dicts
    {image_path: str, label: str} por cada imagen encontrada.

    NO verifica integridad en el scan — las imágenes corruptas se manejan
    al cargarlas en __getitem__ (devuelve tensor negro + warning).
    """
    records = []
    for path in class_root.rglob("*"):
        if path.suffix.lower() not in VALID_EXTENSIONS:
            continue
        records.append({"image_path": str(path), "label": class_name})
    return records


def build_dataframe() -> pd.DataFrame:
    """
    Construye el DataFrame completo con todas las imágenes de las 3 clases.

    Este DataFrame es el "registro" central del dataset — cada fila tiene:
    - image_path: ruta absoluta a la imagen
    - label: nombre de la clase (string)

    Similar a mydataset = pd.DataFrame(columns=['image_path', 'label'])
    del notebook Clase_VC.
    """
    all_records = []
    for class_name, class_root in CLASS_DIRS.items():
        records = scan_class_dir(class_name, class_root)
        all_records.extend(records)
        print(f"  {class_name:12s} → {len(records):5d} imágenes  ({class_root})")

    df = pd.DataFrame(all_records)
    print(f"\n  Total: {len(df)} imágenes | Clases: {df['label'].nunique()}")
    return df


# ─── Splits ──────────────────────────────────────────────────────────────────

def split_dataframe(
    df: pd.DataFrame,
    train_ratio: float = TRAIN_RATIO,
    val_ratio:   float = VAL_RATIO,
    seed:        int   = RANDOM_SEED,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:

    test_ratio = 1.0 - train_ratio - val_ratio

    # Paso 1: separar test del resto
    train_val_df, test_df = train_test_split(
        df,
        test_size=test_ratio,
        stratify=df["label"],
        random_state=seed,
    )

    # Paso 2: separar val del train_val
    # val_size es RELATIVO al subconjunto train_val (no al total)
    val_relative = val_ratio / (train_ratio + val_ratio)
    train_df, val_df = train_test_split(
        train_val_df,
        test_size=val_relative,
        stratify=train_val_df["label"],
        random_state=seed,
    )

    return (
        train_df.reset_index(drop=True),
        val_df.reset_index(drop=True),
        test_df.reset_index(drop=True),
    )


def print_split_stats(
    train_df: pd.DataFrame,
    val_df:   pd.DataFrame,
    test_df:  pd.DataFrame,
) -> None:
    """Imprime tabla de distribución de clases por split."""
    print("\n" + "─" * 55)
    print(f"{'Split':<10} {'healthy':>10} {'oidio':>10} {'peronospora':>12} {'Total':>7}")
    print("─" * 55)
    for name, split in [("train", train_df), ("val", val_df), ("test", test_df)]:
        counts = split["label"].value_counts()
        h = counts.get("healthy",     0)
        o = counts.get("oidio",       0)
        p = counts.get("peronospora", 0)
        print(f"{name:<10} {h:>10} {o:>10} {p:>12} {len(split):>7}")
    print("─" * 55 + "\n")


# ─── Pre-cache de imágenes ───────────────────────────────────────────────────

def _cache_fingerprint(df: pd.DataFrame) -> str:
    """
    Genera un hash corto del DataFrame para detectar cambios en el dataset.
    Si agregás o quitás imágenes, el hash cambia y se regenera el cache.
    """
    content = str(sorted(df["image_path"].tolist()))
    return hashlib.md5(content.encode()).hexdigest()[:8]


def _build_cache(df: pd.DataFrame, cache_subdir: Path) -> None:
    """
    Pre-procesa todas las imágenes: resize a 224x224 → guarda como tensor .pt.

    Esto se ejecuta UNA sola vez. Las siguientes ejecuciones cargan directo
    los tensores, eliminando el overhead de PIL Image.open + Resize.

    Cada imagen se guarda como un archivo .pt individual para no tener que
    cargar todo el dataset en memoria de golpe.
    """
    resize = transforms.Compose([
        transforms.Resize(INPUT_SIZE),
        transforms.ToTensor(),
    ])

    cache_subdir.mkdir(parents=True, exist_ok=True)
    total = len(df)

    for idx, row in df.iterrows():
        tensor_path = cache_subdir / f"{idx}.pt"
        if tensor_path.exists():
            continue

        try:
            img = Image.open(row["image_path"]).convert("RGB")
            tensor = resize(img)
        except Exception:
            # Imagen corrupta → tensor negro (3, 224, 224)
            print(f"  ⚠️  Imagen corrupta: {row['image_path']}")
            tensor = torch.zeros(3, *INPUT_SIZE)

        torch.save(tensor, tensor_path)

        if (idx + 1) % 500 == 0 or idx == total - 1:
            print(f"  Cache: {idx + 1}/{total} imágenes procesadas")


def ensure_cache(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> Tuple[Path, Path, Path]:
    """
    Verifica si el cache existe y está actualizado. Si no, lo regenera.

    Returns:
        (train_cache_dir, val_cache_dir, test_cache_dir)
    """
    fp = _cache_fingerprint(pd.concat([train_df, val_df, test_df]))
    base = CACHE_DIR / fp

    train_cache = base / "train"
    val_cache   = base / "val"
    test_cache  = base / "test"

    need_rebuild = not all(d.exists() for d in [train_cache, val_cache, test_cache])

    if need_rebuild:
        print("\n[Cache] Generando cache de imágenes pre-procesadas...")
        print("  (esto solo pasa la primera vez — luego carga directo)\n")
        for name, split_df, cache_dir in [
            ("train", train_df, train_cache),
            ("val",   val_df,   val_cache),
            ("test",  test_df,  test_cache),
        ]:
            print(f"  Procesando {name}...")
            _build_cache(split_df, cache_dir)
        print("\n[Cache] ✓ Cache listo\n")
    else:
        print("[Cache] ✓ Usando cache existente\n")

    return train_cache, val_cache, test_cache


# ─── Transformaciones ────────────────────────────────────────────────────────
#
# Las transformaciones son operaciones que se aplican a cada imagen antes
# de pasarla al modelo. Hay dos tipos:
#
# 1. Augmentation (solo train): variaciones artificiales para que el modelo
#    vea la "misma" imagen de formas distintas → mejor generalización.
#
# 2. Normalización (train + val + test): ajusta los valores de los pixels
#    a las estadísticas de ImageNet (el backbone fue entrenado así).
#
# NOTA: El Resize ya se hizo en el pre-cache. Las imágenes llegan como
# tensores de (3, 224, 224) — no necesitamos Resize ni ToTensor aquí.

def get_train_transform() -> transforms.Compose:
    """
    Augmentation LIVIANO para training.

    ¿Por qué liviano y no pesado?
    En MPS (Apple Silicon) los transforms corren en CPU. Cada milisegundo
    extra por imagen se multiplica por 7000+ imágenes por época.
    Medimos: transforms pesados = 123ms/batch vs livianos = 45ms/batch.

    Transforms elegidos (todos ~0ms overhead):
    - RandomHorizontalFlip: espeja horizontalmente con p=0.5
    - RandomVerticalFlip: espeja verticalmente con p=0.3
    - ColorJitter: variación leve de brillo/contraste (simula luz solar)
    - Normalize: ajusta a estadísticas ImageNet (OBLIGATORIO)
    - RandomErasing: borra un rectángulo random (simula oclusión, p=0.1)
    """
    cfg = AUGMENTATION_CONFIG
    return transforms.Compose([
        transforms.RandomHorizontalFlip(p=cfg["horizontal_flip_prob"]),
        transforms.RandomVerticalFlip(p=cfg["vertical_flip_prob"]),
        transforms.ColorJitter(**cfg["color_jitter"]),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        transforms.RandomErasing(p=cfg["random_erasing_prob"]),
    ])


def get_eval_transform() -> transforms.Compose:
    """
    Transformaciones para val y test: SOLO normalización.

    SIN augmentation — el modelo debe evaluarse en condiciones idénticas
    a las de producción (una foto tal cual, sin modificar).
    """
    return transforms.Compose([
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])


# ─── Dataset ─────────────────────────────────────────────────────────────────

class VidLeafDataset(Dataset):
    """
    Dataset de hojas de vid para clasificación en 3 clases.

    Dos modos de operación:
    1. Con cache (default): carga tensores .pt pre-procesados → RÁPIDO
    2. Sin cache (fallback): carga JPEGs con PIL → más lento pero funciona

    Basado en el patrón CatsDogsDataset del notebook Clase_VC:
        class CatsDogsDataset(Dataset):
            def __init__(self, img_path_list, lab_list, transform=None):
                self.images = img_path_list
                self.labels = lab_list
                self.transform = transform
            def __getitem__(self, idx):
                image = Image.open(self.images[idx]).convert("RGB")
                label = self.labels[idx]
                if self.transform:
                    image = self.transform(image)
                return image, label
    """

    def __init__(
        self,
        df: pd.DataFrame,
        transform: Optional[transforms.Compose] = None,
        cache_dir: Optional[Path] = None,
    ):
        self.df        = df
        self.transform = transform
        self.cache_dir = cache_dir  # None = modo sin cache (PIL directo)

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        row       = self.df.iloc[idx]
        label_str = row["label"]
        label_idx = CLASS_TO_IDX[label_str]

        if self.cache_dir is not None:
            # Modo cache: carga tensor pre-procesado
            tensor_path = self.cache_dir / f"{idx}.pt"
            try:
                image = torch.load(tensor_path, weights_only=True)
            except Exception:
                image = torch.zeros(3, *INPUT_SIZE)
        else:
            # Modo fallback: carga JPEG con PIL (más lento)
            try:
                img = Image.open(row["image_path"]).convert("RGB")
                resize_and_tensor = transforms.Compose([
                    transforms.Resize(INPUT_SIZE),
                    transforms.ToTensor(),
                ])
                image = resize_and_tensor(img)
            except Exception:
                print(f"  ⚠️  Imagen corrupta ignorada: {row['image_path']}")
                image = torch.zeros(3, *INPUT_SIZE)

        # Aplicar transforms (augmentation + normalización)
        if self.transform:
            image = self.transform(image)

        return image, label_idx


# ─── DataLoaders ─────────────────────────────────────────────────────────────

def _resolve_num_workers() -> int:
    """
    Determina num_workers según el dispositivo.

    MPS (Apple Silicon): DEBE ser 0.
    ¿Por qué? PyTorch fork() crea workers que intentan acceder al mismo
    MPS command buffer → deadlock. No es un bug, es una limitación
    arquitectural de Metal (single-process command queue).

    CUDA (Colab T4): 2-4 workers — paraleliza I/O de disco con cómputo GPU.
    CPU: 0 — sin GPU que saturar, workers solo agregan overhead.
    """
    if torch.cuda.is_available():
        return min(4, os.cpu_count() or 4)
    return 0


def get_dataloaders(
    batch_size: int = BATCH_SIZE,
    num_workers: int = None,
    use_cache: bool = True,
) -> Tuple[DataLoader, DataLoader, DataLoader, Dict]:
    """
    Punto de entrada principal. Devuelve train/val/test DataLoaders
    y un diccionario con estadísticas del split.

    Equivalente a este bloque del notebook Clase_VC:
        train_dataloader = DataLoader(train_dataset, batch_size=64, shuffle=True)
        val_dataloader = DataLoader(val_dataset, batch_size=64, shuffle=True)
        test_dataloader = DataLoader(test_dataset, batch_size=1, shuffle=False)

    Pero con cache de tensores, class weights, y configuración automática.

    Args:
        batch_size: tamaño del batch (default: 64)
        num_workers: workers para data loading (None = autodetect)
        use_cache: True = usar pre-cache de tensores (recomendado)

    Returns:
        train_loader, val_loader, test_loader, split_info
    """
    if num_workers is None:
        num_workers = _resolve_num_workers()
    print(f"[Dataset] num_workers={num_workers} (autodetectado)")

    print("\n[Dataset] Escaneando imágenes...")
    df = build_dataframe()

    print("\n[Dataset] Dividiendo en train/val/test...")
    train_df, val_df, test_df = split_dataframe(df)
    print_split_stats(train_df, val_df, test_df)

    # Pre-cache de imágenes (solo la primera vez)
    if use_cache:
        train_cache, val_cache, test_cache = ensure_cache(train_df, val_df, test_df)
    else:
        train_cache = val_cache = test_cache = None

    # ── Class weights para la loss function ───────────────────────────────
    # El dataset está desbalanceado: healthy >> peronospora >> oidio.
    # Sin weights, el modelo podría aprender a predecir siempre "healthy"
    # y tener 63% de accuracy sin haber aprendido nada útil.
    #
    # La fórmula: weight_i = N_total / (N_clases * N_clase_i)
    # Clases con menos imágenes → peso más alto → más penalización si se equivoca.
    n_total = len(train_df)
    n_classes = train_df["label"].nunique()
    class_counts = train_df["label"].value_counts().to_dict()
    class_weight_list = [
        n_total / (n_classes * class_counts[IDX_TO_CLASS[i]])
        for i in range(n_classes)
    ]
    class_weights_tensor = torch.tensor(class_weight_list, dtype=torch.float)

    split_info = {
        "train_df":      train_df,
        "val_df":        val_df,
        "test_df":       test_df,
        "class_counts":  class_counts,
        "class_weights": class_weights_tensor,
    }

    # ── Crear Datasets ────────────────────────────────────────────────────
    train_dataset = VidLeafDataset(train_df, transform=get_train_transform(), cache_dir=train_cache)
    val_dataset   = VidLeafDataset(val_df,   transform=get_eval_transform(),  cache_dir=val_cache)
    test_dataset  = VidLeafDataset(test_df,  transform=get_eval_transform(),  cache_dir=test_cache)

    # pin_memory: pre-aloca memoria en la GPU. Solo funciona con CUDA.
    use_pin_memory = torch.cuda.is_available()

    # ── Crear DataLoaders ─────────────────────────────────────────────────
    # shuffle=True en train → el modelo ve los datos en orden diferente cada época
    # shuffle=False en val/test → resultados reproducibles
    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=use_pin_memory,
        drop_last=True,  # descarta el último batch incompleto (evita batch de 1-2 imgs)
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=use_pin_memory,
    )
    test_loader = DataLoader(
        test_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=use_pin_memory,
    )

    print(f"[Dataset] Batches train={len(train_loader)} | val={len(val_loader)} | test={len(test_loader)}")
    return train_loader, val_loader, test_loader, split_info
