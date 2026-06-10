"""
prepare_zenodo.py
=================
Script de integración del dataset Zenodo para DetectVID.

Clasifica cada imagen del dataset COCO de Zenodo en una de cuatro clases:
  - healthy      → solo anotaciones de fondo (vines_leaf / vines_grape) o ninguna
  - oidio        → la enfermedad predominante es powdery mildew
  - peronospora  → la enfermedad predominante es downy mildew
  - others       → otras enfermedades (black_rot, grey_mould, esca, etc.)

La clasificación usa votación por mayoría sobre las anotaciones (bounding-boxes /
segmentaciones) de cada imagen, ignorando las clases de fondo.
En caso de empate, se prioriza: oidio > peronospora > others.

Uso:
    python prepare_zenodo.py [--zenodo-dir RUTA] [--output-dir RUTA] [--dry-run]
"""

import argparse
import json
import logging
import shutil
import sys
from collections import defaultdict
from pathlib import Path


# ──────────────────────────────────────────────────────────────────────────────
# Configuración de logging
# ──────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s  %(message)s",
)
log = logging.getLogger("prepare_zenodo")


# ──────────────────────────────────────────────────────────────────────────────
# Constantes de dominio
# ──────────────────────────────────────────────────────────────────────────────

# Índices COCO de las 16 categorías del dataset Zenodo
ZENODO_CATEGORIES = {
    0:  "accartocciamento_fogliare",
    1:  "vl_black_rot",
    2:  "vg_black_rot",
    3:  "vl_grey_mould",
    4:  "vg_grey_mould",
    5:  "carie_bianca_grappolo",
    6:  "vines_leaf",         # hoja sana → clase de fondo
    7:  "vines_grape",        # uva sana  → clase de fondo
    8:  "malattia_esca",
    9:  "vl_powdery_mildew",  # oidio en hoja
    10: "vg_powdery_mildew",  # oidio en uva
    11: "oidio_tralci",       # oidio en ramas
    12: "vl_downy_mildew",    # peronospora en hoja
    13: "vg_downy_mildew",    # peronospora en uva
    14: "red_blotch_foglia",
    15: "virosi_pinot_grigio",
}

# IDs de categoría que corresponden a clases de fondo (no son enfermedades)
BACKGROUND_IDS: set[int] = {6, 7}

# Mapeo de clase DetectVID → conjunto de category_id de Zenodo
DISEASE_GROUPS: dict[str, set[int]] = {
    "oidio":       {9, 10, 11},
    "peronospora": {12, 13},
    "others":      {0, 1, 2, 3, 4, 5, 8, 14, 15},
}

# Orden de prioridad en caso de empate (index 0 = mayor prioridad)
TIE_PRIORITY: list[str] = ["oidio", "peronospora", "others"]

# Clases DetectVID finales
ALL_CLASSES: list[str] = ["healthy", "oidio", "peronospora", "others"]

# Splits
SPLITS: list[str] = ["train", "val"]


# ──────────────────────────────────────────────────────────────────────────────
# Rutas por defecto (detectadas automáticamente relativas a este script)
# ──────────────────────────────────────────────────────────────────────────────

# Estructura esperada:
#   DetectVID/
#   ├── Datasets/
#   │   └── zenodo_dataset/
#   │       ├── annotations/
#   │       │   ├── train.json
#   │       │   └── validation.json
#   │       └── images/
#   └── ml/
#       └── scripts/
#           └── prepare_zenodo.py  ← este archivo

_THIS_FILE = Path(__file__).resolve()
# Subimos hasta encontrar la carpeta que contiene "Datasets/" — robusto
# sin importar desde qué directorio se corre el script.
_PROJECT_ROOT = _THIS_FILE.parents[2]  # DetectVID/
# Verificación explícita: si no existe Datasets/ acá, buscamos más arriba
if not (_PROJECT_ROOT / "Datasets").exists():
    for _parent in _THIS_FILE.parents:
        if (_parent / "Datasets").exists():
            _PROJECT_ROOT = _parent
            break

DEFAULT_ZENODO_DIR = _PROJECT_ROOT / "Datasets" / "zenodo_dataset"
DEFAULT_OUTPUT_DIR = _PROJECT_ROOT / "Datasets"
DEFAULT_REPORT_PATH = _THIS_FILE.parents[1] / "results" / "zenodo_integration_report.json"


# ──────────────────────────────────────────────────────────────────────────────
# Función: leer un JSON COCO
# ──────────────────────────────────────────────────────────────────────────────

def leer_coco(json_path: Path) -> tuple[dict, dict]:
    """
    Lee un archivo JSON en formato COCO y devuelve:
      - images_map: {image_id → filename}
      - anns_map:   {image_id → [category_id, ...]}

    Nota: el campo 'category_id' en COCO es 1-based por convención, pero el
    dataset Zenodo usa 0-based. Validamos contra ZENODO_CATEGORIES para no
    asumir nada.
    """
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Construimos un mapa id → nombre de archivo
    images_map: dict[int, str] = {
        img["id"]: img["file_name"]
        for img in data.get("images", [])
    }

    # Construimos un mapa image_id → lista de category_ids de sus anotaciones
    anns_map: dict[int, list[int]] = defaultdict(list)
    for ann in data.get("annotations", []):
        anns_map[ann["image_id"]].append(ann["category_id"])

    total_anns = sum(len(v) for v in anns_map.values())
    log.debug(
        "  %s: %d imágenes, %d anotaciones",
        json_path.name, len(images_map), total_anns,
    )
    return dict(images_map), dict(anns_map)


# ──────────────────────────────────────────────────────────────────────────────
# Función: clasificar una imagen por regla de mayoría ponderada
# ──────────────────────────────────────────────────────────────────────────────

def clasificar_imagen(
    image_id: int,
    filename: str,
    anns_map: dict[int, list[int]],
) -> tuple[str, str]:
    """
    Aplica la regla de votación por mayoría para determinar la clase de una imagen.

    Retorna:
      (clase, motivo)
        clase:  "healthy" | "oidio" | "peronospora" | "others"
        motivo: cadena descriptiva del razonamiento (para el reporte)
    """
    cat_ids = anns_map.get(image_id, [])

    # Filtrar las clases de fondo — no aportan al diagnóstico de enfermedad
    enfermedad_ids = [c for c in cat_ids if c not in BACKGROUND_IDS]

    if not enfermedad_ids:
        # Sin anotaciones de enfermedad → imagen sana
        return "healthy", "sin anotaciones de enfermedad"

    # Contar votos por grupo
    votos: dict[str, int] = {grupo: 0 for grupo in DISEASE_GROUPS}
    for cat_id in enfermedad_ids:
        for grupo, ids_grupo in DISEASE_GROUPS.items():
            if cat_id in ids_grupo:
                votos[grupo] += 1
                break  # cada categoría pertenece a un único grupo

    max_votos = max(votos.values())

    # Detectar empate entre grupos con el máximo de votos
    ganadores = [g for g, v in votos.items() if v == max_votos]

    if len(ganadores) == 1:
        # Sin empate, ganador claro
        clase = ganadores[0]
        motivo = f"mayoría clara: {votos}"
    else:
        # Empate → aplicar prioridad oidio > peronospora > others
        clase = next(g for g in TIE_PRIORITY if g in ganadores)
        motivo = f"EMPATE {ganadores} → prioridad asignó '{clase}' | votos={votos}"
        log.debug("  EMPATE en %s (%s): %s", filename, image_id, motivo)

    return clase, motivo


# ──────────────────────────────────────────────────────────────────────────────
# Función principal
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    # ── Argumentos CLI ──────────────────────────────────────────────────────
    parser = argparse.ArgumentParser(
        description="Integra el dataset Zenodo en la estructura DetectVID.",
    )
    parser.add_argument(
        "--zenodo-dir",
        type=Path,
        default=DEFAULT_ZENODO_DIR,
        help=f"Directorio raíz del dataset Zenodo (default: {DEFAULT_ZENODO_DIR})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directorio de salida donde se crearán las carpetas (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula la ejecución sin copiar ningún archivo.",
    )
    args = parser.parse_args()

    zenodo_dir: Path = args.zenodo_dir.resolve()
    output_dir: Path = args.output_dir.resolve()
    dry_run: bool = args.dry_run

    # Rutas internas del dataset Zenodo
    annotations_dir = zenodo_dir / "annotations"
    images_dir      = zenodo_dir / "images"

    print()
    print("═" * 59)
    print("  DetectVID — Integración Dataset Zenodo")
    if dry_run:
        print("  ⚠  MODO DRY-RUN — no se copiará ningún archivo")
    print("═" * 59)
    print()

    # ── [1/3] Leer anotaciones ──────────────────────────────────────────────
    print("[1/3] Leyendo anotaciones...")

    train_json_path = annotations_dir / "train.json"
    val_json_path   = annotations_dir / "validation.json"

    for p in (train_json_path, val_json_path, images_dir):
        if not p.exists():
            log.error("No se encontró: %s", p)
            sys.exit(1)

    train_images, train_anns = leer_coco(train_json_path)
    val_images,   val_anns   = leer_coco(val_json_path)

    total_train_anns = sum(len(v) for v in train_anns.values())
    total_val_anns   = sum(len(v) for v in val_anns.values())

    print(f"  train.json:       {len(train_images):4d} imágenes, {total_train_anns:6d} anotaciones")
    print(f"  validation.json:  {len(val_images):4d} imágenes, {total_val_anns:6d} anotaciones")
    print()

    # ── [2/3] Clasificar imágenes ───────────────────────────────────────────
    print("[2/3] Clasificando imágenes...")

    # Estructura: {split → {clase → [filename, ...]}}
    clasificaciones: dict[str, dict[str, list[str]]] = {
        split: {clase: [] for clase in ALL_CLASSES}
        for split in SPLITS
    }

    # Detalle del razonamiento (para el reporte JSON)
    # {filename → {split, clase, motivo}}
    detalle: dict[str, dict] = {}

    # Detectar duplicados entre splits (imagen en train y val)
    filenames_train = set(train_images.values())
    filenames_val   = set(val_images.values())
    duplicados = filenames_train & filenames_val
    if duplicados:
        log.warning(
            "%d imagen(es) aparecen en AMBOS splits — se respetará el split train: %s",
            len(duplicados),
            duplicados,
        )

    # Conjunto para evitar procesar dos veces los duplicados
    ya_procesados: set[str] = set()

    def _procesar_split(
        split_label: str,
        images_map: dict[int, str],
        anns_map: dict[int, list[int]],
    ) -> None:
        """Clasifica todas las imágenes de un split y las registra en `clasificaciones`."""
        print(f"  Procesando {split_label:6s} ({len(images_map):4d} imágenes)...")
        for img_id, filename in images_map.items():
            # Si es duplicado y ya lo procesamos (en train), lo saltamos en val
            if filename in ya_procesados:
                log.warning(
                    "DUPLICADO ignorado en '%s': %s (ya clasificado en train)",
                    split_label, filename,
                )
                continue

            clase, motivo = clasificar_imagen(img_id, filename, anns_map)
            clasificaciones[split_label][clase].append(filename)
            ya_procesados.add(filename)
            detalle[filename] = {
                "split":  split_label,
                "clase":  clase,
                "motivo": motivo,
            }

    _procesar_split("train", train_images, train_anns)
    _procesar_split("val",   val_images,   val_anns)

    print()

    # ── [3/3] Copiar imágenes ───────────────────────────────────────────────
    print("[3/3] Copiando imágenes...")

    # Estadísticas para el reporte final
    copiadas:      int = 0
    no_encontradas: list[str] = []

    # Para cada clase y split creamos la carpeta de destino y copiamos
    for clase in ALL_CLASSES:
        for split in SPLITS:
            # Nombre de la carpeta destino: zenodo_{clase}_{split}
            carpeta_nombre = f"zenodo_{clase}_{split}"
            carpeta_destino = output_dir / f"zenodo_{clase}" / carpeta_nombre

            filenames = clasificaciones[split][clase]

            if not dry_run:
                carpeta_destino.mkdir(parents=True, exist_ok=True)

            copiadas_carpeta = 0
            for filename in filenames:
                # Las imágenes originales están TODAS en una sola carpeta plana
                src = images_dir / filename
                dst = carpeta_destino / filename

                if not src.exists():
                    log.warning("No encontrada en disco: %s", src)
                    no_encontradas.append(filename)
                    continue

                if not dry_run:
                    try:
                        # shutil.copy2 preserva metadatos; no mueve ni renombra el original
                        shutil.copy2(src, dst)
                        copiadas_carpeta += 1
                        copiadas += 1
                    except OSError as exc:
                        log.warning("Error copiando %s: %s", src, exc)
                        no_encontradas.append(filename)
                else:
                    # En dry-run solo contamos
                    copiadas_carpeta += 1
                    copiadas += 1

            print(f"  {carpeta_nombre:<35s} → {copiadas_carpeta:4d} imágenes {'(simulado)' if dry_run else 'copiadas'}")

    print()

    # ── Resumen ─────────────────────────────────────────────────────────────
    total_procesadas = len(ya_procesados)

    print("═" * 59)
    print("  Resumen")
    print("═" * 59)
    print(f"  Total procesadas : {total_procesadas}")
    print(f"  Copiadas         : {copiadas}")
    print(f"  No encontradas   : {len(no_encontradas):4d}  (ver warnings arriba)")
    print()
    print("  Distribución final:")
    print(f"  ┌{'─'*17}┬{'─'*7}┬{'─'*6}┬{'─'*7}┐")
    print(f"  │ {'Clase':<15} │ {'Train':>5} │ {'Val':>4} │ {'Total':>5} │")
    print(f"  ├{'─'*17}┼{'─'*7}┼{'─'*6}┼{'─'*7}┤")
    for clase in ALL_CLASSES:
        n_train = len(clasificaciones["train"][clase])
        n_val   = len(clasificaciones["val"][clase])
        n_total = n_train + n_val
        print(f"  │ {clase:<15} │ {n_train:>5} │ {n_val:>4} │ {n_total:>5} │")
    print(f"  └{'─'*17}┴{'─'*7}┴{'─'*6}┴{'─'*7}┘")
    print()

    # ── Guardar reporte JSON ─────────────────────────────────────────────────
    reporte = {
        "summary": {
            "total_procesadas": total_procesadas,
            "copiadas":         copiadas,
            "no_encontradas":   len(no_encontradas),
            "dry_run":          dry_run,
        },
        "distribucion": {
            clase: {
                "train": len(clasificaciones["train"][clase]),
                "val":   len(clasificaciones["val"][clase]),
                "total": len(clasificaciones["train"][clase]) + len(clasificaciones["val"][clase]),
            }
            for clase in ALL_CLASSES
        },
        "no_encontradas": no_encontradas,
        "detalle_clasificacion": detalle,
    }

    reporte_path = DEFAULT_REPORT_PATH
    if not dry_run:
        reporte_path.parent.mkdir(parents=True, exist_ok=True)
        with open(reporte_path, "w", encoding="utf-8") as f:
            json.dump(reporte, f, ensure_ascii=False, indent=2)
        print(f"✓ Reporte guardado en: {reporte_path.relative_to(_PROJECT_ROOT / 'ml')}")
    else:
        print(f"  (dry-run) Reporte NO guardado: {reporte_path}")

    print("✓ Listo. Podés correr train.py.")
    print()


# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    main()
