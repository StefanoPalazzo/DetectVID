"""
dataset.py — Carga, preparación y splits del dataset de hojas de vid
═══════════════════════════════════════════════════════════════════════

Pipeline de datos:
  1. Escanea directorios de cada clase → construye DataFrame (path, label, split_hint)
  2. Split estratificado train/val/test (70/15/15) según la estrategia configurada
  3. Pre-cache: redimensiona imágenes a 224x224 y guarda como tensores .pt
  4. DataLoader con transforms apropiados por split

¿Por qué pre-cache?
  Las imágenes originales son JPEG de ~256x256. Cada época, el DataLoader las
  abre con PIL, las convierte a RGB, las redimensiona y las transforma a tensor.
  Con 7000+ imágenes, esto es ~45-120ms por batch EN CPU (el cuello de botella).

  Con pre-cache: la primera ejecución procesa todo (~30s) y guarda tensores .pt.
  Las ejecuciones siguientes cargan directo con torch.load() → ~15ms por batch.
  Es como pre-cocinar los ingredientes antes de empezar a cocinar.

Modos de dataset (DATASET_MODE):
  "3cls_no_zenodo"  → solo originales, 3 clases. Baseline.
  "3cls_zenodo"     → originales + zenodo, 3 clases
  "4cls_zenodo"     → originales + zenodo, 4 clases (agrega "others")

Estrategias de split (SPLIT_MODE):
  None              → split 70/15/15 puro sobre todo el pool
  "split_respected" → respeta train/val del zenodo; los originales se splittean
  "split_mixed"     → mezcla todo y hace split 70/15/15 aleatorio

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
    CLASS_DIRS, TRAIN_RATIO, VAL_RATIO, TEST_RATIO, RANDOM_SEED,
    INPUT_SIZE, IMAGENET_MEAN, IMAGENET_STD,
    AUGMENTATION_CONFIG, BATCH_SIZE, CACHE_DIR,
    DATASET_MODE, SPLIT_MODE, BALANCING_MODE,
    CLASS_TO_IDX_3, CLASS_TO_IDX_4,
)


# ─── Extensiones de imagen admitidas ─────────────────────────────────────────
VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}


# ─── Mapeo de clases según modo ───────────────────────────────────────────────

def get_class_mapping(dataset_mode: str) -> Tuple[Dict[str, int], Dict[int, str]]:
    """
    Devuelve (CLASS_TO_IDX, IDX_TO_CLASS) según el modo de dataset.

    Para 4 clases, "others" tiene índice 3, así los índices 0-2 son
    compatibles con los modelos de 3 clases.
    """
    mapping = CLASS_TO_IDX_4 if dataset_mode == "4cls_zenodo" else CLASS_TO_IDX_3
    return mapping, {v: k for k, v in mapping.items()}


# ─── Escaneo de archivos ──────────────────────────────────────────────────────

def scan_class_dir(class_name: str, class_root: Path) -> List[Dict]:
    """
    Recorre recursivamente class_root y devuelve una lista de dicts
    {image_path: str, label: str} por cada imagen encontrada.

    Si la carpeta no existe, imprime un warning y devuelve lista vacía.
    NO verifica integridad en el scan — las imágenes corruptas se manejan
    al cargarlas en __getitem__ (devuelve tensor negro + warning).
    """
    if not class_root.exists():
        print(f"  ⚠️  Carpeta no encontrada (se omite): {class_root}")
        return []

    records = []
    for path in class_root.rglob("*"):
        if path.suffix.lower() not in VALID_EXTENSIONS:
            continue
        records.append({"image_path": str(path), "label": class_name})
    return records


def _scan_with_split_hint(class_name: str, class_root: Path, split_hint: str) -> List[Dict]:
    """
    Como scan_class_dir pero agrega split_hint al record.

    split_hint puede ser "train", "val" o "free" (libre para asignar).
    Se usa en split_respected para forzar imágenes del zenodo a su split correcto.
    """
    if not class_root.exists():
        print(f"  ⚠️  Carpeta no encontrada (se omite): {class_root}")
        return []

    records = []
    for path in class_root.rglob("*"):
        if path.suffix.lower() not in VALID_EXTENSIONS:
            continue
        records.append({
            "image_path": str(path),
            "label":      class_name,
            "split_hint": split_hint,
        })
    return records


# ─── Construcción del DataFrame por modo ─────────────────────────────────────

def build_dataframe_for_experiment(
    dataset_mode: str,
    split_mode: Optional[str],
) -> pd.DataFrame:
    """
    Construye el DataFrame completo según el modo de experimento.

    El DataFrame tiene columnas:
      - image_path: ruta absoluta a la imagen
      - label:      clase (string)
      - split:      "train", "val" o "test" — asignado según la estrategia

    Args:
        dataset_mode: "3cls_no_zenodo" | "3cls_zenodo" | "4cls_zenodo"
        split_mode:   None | "split_respected" | "split_mixed"

    Returns:
        DataFrame con columnas [image_path, label, split]
    """
    print(f"\n[Dataset] Modo: {dataset_mode} | Split: {split_mode}")

    if dataset_mode == "3cls_no_zenodo":
        return _build_3cls_no_zenodo()

    elif dataset_mode == "3cls_zenodo":
        if split_mode == "split_respected":
            return _build_3cls_zenodo_respected()
        elif split_mode == "split_mixed":
            return _build_3cls_zenodo_mixed()
        else:
            raise ValueError(f"split_mode '{split_mode}' no válido para dataset_mode '{dataset_mode}'")

    elif dataset_mode == "4cls_zenodo":
        if split_mode == "split_respected":
            return _build_4cls_zenodo_respected()
        elif split_mode == "split_mixed":
            return _build_4cls_zenodo_mixed()
        else:
            raise ValueError(f"split_mode '{split_mode}' no válido para dataset_mode '{dataset_mode}'")

    else:
        raise ValueError(f"dataset_mode '{dataset_mode}' no reconocido")


def _build_3cls_no_zenodo() -> pd.DataFrame:
    """
    Solo dataset original, 3 clases (healthy/oidio/peronospora). Baseline.
    Split 70/15/15 sobre todo el pool.
    """
    print("  [3cls_no_zenodo] Escaneando originales...")
    records = []
    for clase in ["healthy", "oidio", "peronospora"]:
        r = scan_class_dir(clase, CLASS_DIRS[clase])
        records.extend(r)
        print(f"    {clase:12s} → {len(r):5d} imágenes")

    df = pd.DataFrame(records)
    print(f"  Total: {len(df)} imágenes")
    return _apply_split_70_15_15(df)


def _build_3cls_zenodo_respected() -> pd.DataFrame:
    """
    Originales + zenodo, 3 clases.
    Las imágenes de zenodo_*_train van FORZOSAMENTE al split train.
    Las imágenes de zenodo_*_val van FORZOSAMENTE al split val.
    Las imágenes originales se dividen 70/15/15 y su test set es el test final.
    """
    print("  [3cls_zenodo / split_respected] Escaneando con splits forzados...")
    records = []

    # Originales — se splitearán libremente
    for clase in ["healthy", "oidio", "peronospora"]:
        r = _scan_with_split_hint(clase, CLASS_DIRS[clase], "free")
        records.extend(r)
        print(f"    {clase:12s} (original) → {len(r):5d} imágenes")

    # Zenodo — split forzado
    for clase in ["healthy", "oidio", "peronospora"]:
        r_train = _scan_with_split_hint(clase, CLASS_DIRS[f"zenodo_{clase}_train"], "train")
        r_val   = _scan_with_split_hint(clase, CLASS_DIRS[f"zenodo_{clase}_val"],   "val")
        records.extend(r_train)
        records.extend(r_val)
        print(f"    {clase:12s} (zenodo)   → {len(r_train):5d} train + {len(r_val):5d} val")

    df_all = pd.DataFrame(records)
    return _apply_split_respected(df_all)


def _build_3cls_zenodo_mixed() -> pd.DataFrame:
    """
    Originales + zenodo (mezclando train y val del zenodo), 3 clases.
    Split 70/15/15 sobre TODO el pool mezclado.
    """
    print("  [3cls_zenodo / split_mixed] Escaneando y mezclando todo...")
    records = []

    for clase in ["healthy", "oidio", "peronospora"]:
        r_orig  = scan_class_dir(clase, CLASS_DIRS[clase])
        r_train = scan_class_dir(clase, CLASS_DIRS[f"zenodo_{clase}_train"])
        r_val   = scan_class_dir(clase, CLASS_DIRS[f"zenodo_{clase}_val"])
        records.extend(r_orig + r_train + r_val)
        print(f"    {clase:12s} → {len(r_orig):5d} orig + {len(r_train):5d} zen_train + {len(r_val):5d} zen_val")

    df = pd.DataFrame(records)
    print(f"  Total: {len(df)} imágenes")
    return _apply_split_70_15_15(df)


def _build_4cls_zenodo_respected() -> pd.DataFrame:
    """
    Igual que 3cls_respected pero agrega la clase "others" usando
    zenodo_others_* + Datasets/otros/.
    """
    print("  [4cls_zenodo / split_respected] Escaneando con splits forzados (4 clases)...")
    records = []

    # Originales — se splitearán libremente
    for clase in ["healthy", "oidio", "peronospora"]:
        r = _scan_with_split_hint(clase, CLASS_DIRS[clase], "free")
        records.extend(r)
        print(f"    {clase:12s} (original) → {len(r):5d} imágenes")

    # Otros originales — libres
    r_otros = _scan_with_split_hint("others", CLASS_DIRS["others"], "free")
    records.extend(r_otros)
    print(f"    {'others':12s} (original) → {len(r_otros):5d} imágenes")

    # Zenodo 3 clases — split forzado
    for clase in ["healthy", "oidio", "peronospora"]:
        r_train = _scan_with_split_hint(clase, CLASS_DIRS[f"zenodo_{clase}_train"], "train")
        r_val   = _scan_with_split_hint(clase, CLASS_DIRS[f"zenodo_{clase}_val"],   "val")
        records.extend(r_train + r_val)
        print(f"    {clase:12s} (zenodo)   → {len(r_train):5d} train + {len(r_val):5d} val")

    # Zenodo others — split forzado
    r_oth_train = _scan_with_split_hint("others", CLASS_DIRS["zenodo_others_train"], "train")
    r_oth_val   = _scan_with_split_hint("others", CLASS_DIRS["zenodo_others_val"],   "val")
    records.extend(r_oth_train + r_oth_val)
    print(f"    {'others':12s} (zenodo)   → {len(r_oth_train):5d} train + {len(r_oth_val):5d} val")

    df_all = pd.DataFrame(records)
    return _apply_split_respected(df_all)


def _build_4cls_zenodo_mixed() -> pd.DataFrame:
    """
    Igual que 3cls_mixed pero agrega la clase "others" usando
    zenodo_others_* + Datasets/otros/.
    """
    print("  [4cls_zenodo / split_mixed] Escaneando y mezclando todo (4 clases)...")
    records = []

    for clase in ["healthy", "oidio", "peronospora"]:
        r_orig  = scan_class_dir(clase, CLASS_DIRS[clase])
        r_train = scan_class_dir(clase, CLASS_DIRS[f"zenodo_{clase}_train"])
        r_val   = scan_class_dir(clase, CLASS_DIRS[f"zenodo_{clase}_val"])
        records.extend(r_orig + r_train + r_val)
        print(f"    {clase:12s} → {len(r_orig):5d} orig + {len(r_train):5d} zen_train + {len(r_val):5d} zen_val")

    r_otros = scan_class_dir("others", CLASS_DIRS["others"])
    r_oth_train = scan_class_dir("others", CLASS_DIRS["zenodo_others_train"])
    r_oth_val   = scan_class_dir("others", CLASS_DIRS["zenodo_others_val"])
    records.extend(r_otros + r_oth_train + r_oth_val)
    print(f"    {'others':12s} → {len(r_otros):5d} orig + {len(r_oth_train):5d} zen_train + {len(r_oth_val):5d} zen_val")

    df = pd.DataFrame(records)
    print(f"  Total: {len(df)} imágenes")
    return _apply_split_70_15_15(df)


# ─── Estrategias de split ─────────────────────────────────────────────────────

def _apply_split_70_15_15(df: pd.DataFrame) -> pd.DataFrame:
    """
    Divide el DataFrame en train/val/test con ratio 70/15/15.
    La división es estratificada para mantener la proporción de clases.
    """
    test_ratio = 1.0 - TRAIN_RATIO - VAL_RATIO

    train_val_df, test_df = train_test_split(
        df,
        test_size=test_ratio,
        stratify=df["label"],
        random_state=RANDOM_SEED,
    )

    val_relative = VAL_RATIO / (TRAIN_RATIO + VAL_RATIO)
    train_df, val_df = train_test_split(
        train_val_df,
        test_size=val_relative,
        stratify=train_val_df["label"],
        random_state=RANDOM_SEED,
    )

    train_df = train_df.copy()
    val_df   = val_df.copy()
    test_df  = test_df.copy()

    train_df["split"] = "train"
    val_df["split"]   = "val"
    test_df["split"]  = "test"

    result = pd.concat([train_df, val_df, test_df]).reset_index(drop=True)
    # Limpiar split_hint si existe (no la necesitamos más)
    if "split_hint" in result.columns:
        result = result.drop(columns=["split_hint"])
    return result


def _apply_split_respected(df_all: pd.DataFrame) -> pd.DataFrame:
    """
    Aplica split respetando los hints del zenodo.

    - Imágenes con split_hint="train" → van directo a train
    - Imágenes con split_hint="val"   → van directo a val
    - Imágenes con split_hint="free"  → se dividen 70/15/15

    Las imágenes "free" aportan su porción test al test set final.
    Los forzados train/val del zenodo NO van al test set.
    """
    # Separar por hint
    forced_train = df_all[df_all["split_hint"] == "train"].copy()
    forced_val   = df_all[df_all["split_hint"] == "val"].copy()
    free_df      = df_all[df_all["split_hint"] == "free"].copy()

    forced_train["split"] = "train"
    forced_val["split"]   = "val"

    # Split libre 70/15/15 sobre los originales
    if len(free_df) > 0:
        free_split = _apply_split_70_15_15(free_df)
    else:
        free_split = pd.DataFrame(columns=["image_path", "label", "split"])

    result = pd.concat([
        forced_train[["image_path", "label", "split"]],
        forced_val[["image_path", "label", "split"]],
        free_split[["image_path", "label", "split"]],
    ]).reset_index(drop=True)

    return result


# ─── Undersampling ────────────────────────────────────────────────────────────

def undersample_majority_class(df: pd.DataFrame, strategy: str = "undersampled") -> pd.DataFrame:
    """
    Submuestrea la clase mayoritaria para reducir el desbalance.

    Encuentra la clase mayoritaria y la reduce al nivel de la segunda clase
    más grande. Esto preserva más datos que reducir a la minoritaria.

    Solo afecta el split "train" — val y test quedan intactos para
    que la evaluación sea honesta sobre la distribución real.

    Args:
        df:       DataFrame con columnas [image_path, label, split]
        strategy: "undersampled" activa el subsampling (parámetro para extensibilidad)

    Returns:
        DataFrame con la clase mayoritaria reducida en el split train
    """
    if strategy != "undersampled":
        return df

    train_df = df[df["split"] == "train"].copy()
    other_df = df[df["split"] != "train"].copy()

    # Contar imágenes por clase en train
    conteos = train_df["label"].value_counts()

    if len(conteos) < 2:
        print("  ⚠️  Undersampling: solo hay una clase en train, se omite")
        return df

    # Clase mayoritaria → reducir al nivel de la segunda más grande
    clase_mayor   = conteos.index[0]
    nivel_objetivo = conteos.iloc[1]  # Segunda clase más grande

    print(f"  [Undersampling] '{clase_mayor}': {conteos.iloc[0]} → {nivel_objetivo} imágenes")

    # Mantener el resto igual, subsampling solo de la mayoritaria
    clase_mayor_df   = train_df[train_df["label"] == clase_mayor].sample(
        n=nivel_objetivo,
        random_state=RANDOM_SEED,
    )
    resto_df = train_df[train_df["label"] != clase_mayor]

    train_df_balanceado = pd.concat([clase_mayor_df, resto_df]).sample(
        frac=1,
        random_state=RANDOM_SEED,
    ).reset_index(drop=True)

    result = pd.concat([train_df_balanceado, other_df]).reset_index(drop=True)
    print(f"  [Undersampling] Train después: {train_df_balanceado['label'].value_counts().to_dict()}")
    return result


# ─── Compatibilidad hacia atrás ───────────────────────────────────────────────

def build_dataframe() -> pd.DataFrame:
    """
    Versión legacy de build_dataframe. Usa los parámetros del config.

    Mantiene compatibilidad con código que llama a build_dataframe() directamente.
    Para experimentos, usar build_dataframe_for_experiment() explícitamente.
    """
    return build_dataframe_for_experiment(DATASET_MODE, SPLIT_MODE)


def split_dataframe(
    df: pd.DataFrame,
    train_ratio: float = TRAIN_RATIO,
    val_ratio:   float = VAL_RATIO,
    seed:        int   = RANDOM_SEED,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Versión legacy. Si el DataFrame ya tiene columna 'split', la usa directamente.
    Si no, aplica split 70/15/15. Mantiene compatibilidad hacia atrás.
    """
    if "split" in df.columns:
        train_df = df[df["split"] == "train"].reset_index(drop=True)
        val_df   = df[df["split"] == "val"].reset_index(drop=True)
        test_df  = df[df["split"] == "test"].reset_index(drop=True)
        return train_df, val_df, test_df

    # Fallback: split clásico
    test_ratio = 1.0 - train_ratio - val_ratio
    train_val_df, test_df = train_test_split(
        df, test_size=test_ratio, stratify=df["label"], random_state=seed
    )
    val_relative = val_ratio / (train_ratio + val_ratio)
    train_df, val_df = train_test_split(
        train_val_df, test_size=val_relative, stratify=train_val_df["label"], random_state=seed
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
    clases = sorted(set(train_df["label"].tolist() + val_df["label"].tolist() + test_df["label"].tolist()))
    ancho  = max(len(c) for c in clases) + 2

    encabezado = f"{'Split':<10}" + "".join(f"{c:>{ancho}}" for c in clases) + f"{'Total':>8}"
    print("\n" + "─" * len(encabezado))
    print(encabezado)
    print("─" * len(encabezado))

    for nombre, split in [("train", train_df), ("val", val_df), ("test", test_df)]:
        counts = split["label"].value_counts()
        fila   = f"{nombre:<10}" + "".join(f"{counts.get(c, 0):>{ancho}}" for c in clases) + f"{len(split):>8}"
        print(fila)

    print("─" * len(encabezado) + "\n")


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
            _build_cache(split_df.reset_index(drop=True), cache_dir)
        print("\n[Cache] ✓ Cache listo\n")
    else:
        print("[Cache] ✓ Usando cache existente\n")

    return train_cache, val_cache, test_cache


# ─── Transformaciones ────────────────────────────────────────────────────────

class LocalSunGlare(object):
    """
    Simula un reflejo de sol intenso en un parche aleatorio de la imagen.
    Evita alterar el color global para no perder características diagnósticas
    como el amarillo sutil de la Peronospora.
    """
    def __init__(self, p=0.5, scale=(0.05, 0.2), brightness_add=0.4):
        self.p = p
        self.scale = scale
        self.brightness_add = brightness_add

    def __call__(self, img):
        # img es un tensor [C, H, W] después de ToTensor()
        # ¡OJO! En nuestro pipeline de get_train_transform(), las imágenes vienen como PIL Images
        # porque ToTensor se aplica más tarde si no usamos el cache de tensores.
        # Pero si leemos desde el cache, img ES un tensor.
        import math
        
        if torch.rand(1).item() > self.p:
            return img
            
        if isinstance(img, torch.Tensor):
            c, h, w = img.shape
            area = h * w
            target_area = torch.empty(1).uniform_(self.scale[0], self.scale[1]).item() * area
            side = int(math.sqrt(target_area))
            
            if side < h and side < w:
                y1 = torch.randint(0, h - side + 1, size=(1,)).item()
                x1 = torch.randint(0, w - side + 1, size=(1,)).item()
                
                # Para evitar problemas de in-place en tensores, creamos un clon
                img = img.clone()
                img[:, y1:y1+side, x1:x1+side] = torch.clamp(img[:, y1:y1+side, x1:x1+side] + self.brightness_add, 0, 1)
                
            return img
        else:
            # Si es PIL Image
            from PIL import ImageEnhance
            w, h = img.size
            area = h * w
            target_area = torch.empty(1).uniform_(self.scale[0], self.scale[1]).item() * area
            side = int(math.sqrt(target_area))
            
            if side < h and side < w:
                y1 = torch.randint(0, h - side + 1, size=(1,)).item()
                x1 = torch.randint(0, w - side + 1, size=(1,)).item()
                
                # Recortar el parche, aumentar brillo y pegarlo
                patch = img.crop((x1, y1, x1+side, y1+side))
                enhancer = ImageEnhance.Brightness(patch)
                patch = enhancer.enhance(1.0 + self.brightness_add * 2) # factor > 1 aumenta brillo
                
                # Pegar el parche
                img.paste(patch, (x1, y1))
                
            return img


def get_train_transform() -> transforms.Compose:
    """
    Augmentation QUIRÚRGICO para training (Exp 27).

    - RandomResizedCrop: suavizado a 0.7 para no perder bordes.
    - LocalSunGlare: reflejo de sol localizado, sin destrozar el color general.
    """
    cfg = AUGMENTATION_CONFIG
    return transforms.Compose([
        transforms.RandomResizedCrop(INPUT_SIZE, scale=cfg.get("random_resized_crop_scale", (0.7, 1.0))),
        transforms.RandomRotation(cfg.get("random_rotation_degrees", 45)),
        transforms.RandomHorizontalFlip(p=cfg["horizontal_flip_prob"]),
        transforms.RandomVerticalFlip(p=cfg["vertical_flip_prob"]),
        LocalSunGlare(p=cfg.get("local_sun_glare_prob", 0.5)),
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
    Dataset de hojas de vid para clasificación.

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
        class_to_idx: Dict[str, int],
        transform: Optional[transforms.Compose] = None,
        cache_dir: Optional[Path] = None,
    ):
        self.df           = df.reset_index(drop=True)
        self.class_to_idx = class_to_idx
        self.transform    = transform
        self.cache_dir    = cache_dir  # None = modo sin cache (PIL directo)

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        row       = self.df.iloc[idx]
        label_str = row["label"]
        label_idx = self.class_to_idx[label_str]

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

def _resolve_num_workers(use_cache: bool = False) -> int:
    """
    Determina num_workers según el dispositivo y si se usa cache.

    MPS con cache: usar 4 workers con multiprocessing_context="spawn".
    MPS sin cache: 0 workers — con PIL directo, spawn agrega overhead y
    los workers compiten por disco → más lento que single-thread.

    CUDA (Colab T4): 2-4 workers — paraleliza I/O de disco con cómputo GPU.
    CPU: 0 — sin GPU que saturar, workers solo agregan overhead.
    """
    if torch.cuda.is_available():
        return min(4, os.cpu_count() or 4)
    if torch.backends.mps.is_available():
        return 4 if use_cache else 0
    return 0


def get_dataloaders(
    batch_size:     int           = BATCH_SIZE,
    num_workers:    Optional[int] = None,
    use_cache:      bool          = False,
    dataset_mode:   str           = DATASET_MODE,
    split_mode:     Optional[str] = SPLIT_MODE,
    balancing_mode: str           = BALANCING_MODE,
) -> Tuple[DataLoader, DataLoader, DataLoader, Dict]:
    """
    Punto de entrada principal. Devuelve train/val/test DataLoaders
    y un diccionario con estadísticas del split.

    Soporta todos los modos de experimento definidos en config.py.
    Compatible hacia atrás: llamar sin argumentos usa los defaults del config.

    Equivalente a este bloque del notebook Clase_VC:
        train_dataloader = DataLoader(train_dataset, batch_size=64, shuffle=True)
        val_dataloader = DataLoader(val_dataset, batch_size=64, shuffle=True)
        test_dataloader = DataLoader(test_dataset, batch_size=1, shuffle=False)

    Pero con cache de tensores, class weights, y configuración automática.

    Args:
        batch_size:     tamaño del batch (default: 64)
        num_workers:    workers para data loading (None = autodetect)
        use_cache:      True = usar pre-cache de tensores (recomendado)
        dataset_mode:   modo de composición del dataset
        split_mode:     estrategia de split
        balancing_mode: estrategia de balanceo de clases

    Returns:
        train_loader, val_loader, test_loader, split_info
    """
    if num_workers is None:
        num_workers = _resolve_num_workers(use_cache=use_cache)
    print(f"[Dataset] num_workers={num_workers} (autodetectado)")

    # ── Construir DataFrame según el modo ─────────────────────────────────
    df = build_dataframe_for_experiment(dataset_mode, split_mode)

    # ── Separar splits ────────────────────────────────────────────────────
    train_df, val_df, test_df = split_dataframe(df)
    print_split_stats(train_df, val_df, test_df)

    # ── Balanceo ──────────────────────────────────────────────────────────
    if balancing_mode == "undersampled":
        # Aplicar undersampling sobre el DataFrame completo y re-separar
        df_balanceado = undersample_majority_class(df, strategy="undersampled")
        train_df, val_df, test_df = split_dataframe(df_balanceado)
        print("\n  Distribución después del undersampling:")
        print_split_stats(train_df, val_df, test_df)

    # ── Mapeo de clases según el modo ─────────────────────────────────────
    class_to_idx, idx_to_class = get_class_mapping(dataset_mode)
    n_classes = len(class_to_idx)

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
    n_total      = len(train_df)
    class_counts = train_df["label"].value_counts().to_dict()

    class_weight_list = []
    for i in range(n_classes):
        clase     = idx_to_class[i]
        count     = class_counts.get(clase, 1)  # default 1 para evitar division por cero
        class_weight_list.append(n_total / (n_classes * count))

    class_weights_tensor = torch.tensor(class_weight_list, dtype=torch.float)

    split_info = {
        "train_df":      train_df,
        "val_df":        val_df,
        "test_df":       test_df,
        "class_counts":  class_counts,
        "class_weights": class_weights_tensor,
        "class_to_idx":  class_to_idx,
        "idx_to_class":  idx_to_class,
        "n_classes":     n_classes,
        "dataset_mode":  dataset_mode,
        "split_mode":    split_mode,
        "balancing_mode": balancing_mode,
    }

    # ── Crear Datasets ────────────────────────────────────────────────────
    train_dataset = VidLeafDataset(train_df, class_to_idx, transform=get_train_transform(), cache_dir=train_cache)
    val_dataset   = VidLeafDataset(val_df,   class_to_idx, transform=get_eval_transform(),  cache_dir=val_cache)
    test_dataset  = VidLeafDataset(test_df,  class_to_idx, transform=get_eval_transform(),  cache_dir=test_cache)

    # pin_memory: pre-aloca memoria en la GPU. Solo funciona con CUDA.
    use_pin_memory = torch.cuda.is_available()

    # multiprocessing_context: en MPS hay que usar "spawn" (no "fork").
    # fork() hereda el estado de Metal → deadlock en el command buffer.
    # spawn arranca cada worker desde cero → seguro y paralelo.
    # Con num_workers=0 este parámetro se ignora.
    mp_context = "spawn" if (torch.backends.mps.is_available() and num_workers > 0) else None

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
        multiprocessing_context=mp_context,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=use_pin_memory,
        multiprocessing_context=mp_context,
    )
    test_loader = DataLoader(
        test_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=use_pin_memory,
        multiprocessing_context=mp_context,
    )

    print(f"[Dataset] Batches train={len(train_loader)} | val={len(val_loader)} | test={len(test_loader)}")
    return train_loader, val_loader, test_loader, split_info
