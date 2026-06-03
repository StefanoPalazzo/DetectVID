"""
experiments.py — Lanzador de experimentos W&B para DetectVID
═════════════════════════════════════════════════════════════

Define los 12 experimentos del trabajo y los corre en secuencia,
registrando cada run en Weights & Biases para comparación.

Cada experimento explora una dimensión del diseño:
  - arquitectura:  efficientnet_b0 vs resnet18 vs mobilenet_v3 vs resnet50
  - clases:        3 (healthy/oidio/peronospora) vs 4 (+ others)
  - balanceo:      weighted_full vs undersampled

Uso:
    # Correr todos los experimentos
    python src/experiments.py

    # Correr un experimento específico
    python src/experiments.py --experiment exp01_baseline_eff

    # Correr sin W&B (útil para debug local)
    python src/experiments.py --no-wandb

    # Ver todos los experimentos disponibles
    python src/experiments.py --list

    # Dry-run: mostrar qué correría sin ejecutar nada
    python src/experiments.py --dry-run

Antes de correr:
    1. pip install wandb
    2. wandb login   (solo la primera vez)
    3. Verificar que las carpetas zenodo_* existan (correr prepare_zenodo.py antes)
"""

import os
import sys
import gc
import argparse
from pathlib import Path
from typing import List, Optional, Tuple

# Necesario en macOS con MPS — evita que torch se trabe al inicializar
# el backend de Metal la primera vez que se importa desde otro módulo.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import torch

sys.path.insert(0, str(Path(__file__).parent))

from config import (
    BATCH_SIZE, NUM_EPOCHS, LEARNING_RATE, DEVICE,
    WANDB_PROJECT,
)
from train import train


# ─── Definición de los 12 experimentos ───────────────────────────────────────
#
# Cada entrada es una tupla:
#   (experiment_id, model_name, dataset_mode, split_mode, balancing_mode)
#
# Árbol de decisiones:
#
#   ¿Cuántas clases?
#   │
#   ├── 3 clases (healthy / oidio / peronospora)
#   │   ├── Weighted loss
#   │   │   ├── exp01 — EfficientNet-B0   ← BASELINE
#   │   │   ├── exp02 — ResNet18
#   │   │   ├── exp07 — MobileNet-V3
#   │   │   └── exp09 — ResNet50
#   │   └── Undersampling
#   │       └── exp05 — EfficientNet-B0
#   │
#   └── 4 clases (+ others)
#       ├── Weighted loss
#       │   ├── exp03 — EfficientNet-B0
#       │   ├── exp04 — ResNet18
#       │   ├── exp08 — MobileNet-V3
#       │   └── exp10 — ResNet50
#       └── Undersampling
#           ├── exp06 — EfficientNet-B0
#           └── exp11 — EfficientNet-B0 (ganador de 4cls weighted)
#
# Todos los experimentos usan el dataset completo (originales + zenodo, split mixto).
# El split_mode "split_mixed" mezcla train+val del zenodo y redistribuye 70/15/15.

EXPERIMENTS: List[Tuple[str, str, str, Optional[str], str]] = [
    # ── 3 clases — Weighted loss ───────────────────────────────────────────
    # Pregunta: ¿qué arquitectura generaliza mejor con 3 clases?
    # ("exp01_3cls_weighted_eff",     "efficientnet_b0", "3cls_zenodo", "split_mixed", "weighted_full"),  # BASELINE
    # ("exp02_3cls_weighted_res18",   "resnet18",        "3cls_zenodo", "split_mixed", "weighted_full"),
    # ("exp07_3cls_weighted_mob",     "mobilenet_v3",    "3cls_zenodo", "split_mixed", "weighted_full"),
    # ("exp09_3cls_weighted_res50",   "resnet50",        "3cls_zenodo", "split_mixed", "weighted_full"),

    # ── 3 clases — Undersampling ───────────────────────────────────────────
    # Pregunta: ¿undersampling mejora respecto a weighted en 3 clases?
    # ("exp05_3cls_under_eff",        "efficientnet_b0", "3cls_zenodo", "split_mixed", "undersampled"),

    # ── 4 clases — Weighted loss ───────────────────────────────────────────
    # Pregunta: ¿agregar "others" mejora la precisión en campo?
    # ("exp03_4cls_weighted_eff",     "efficientnet_b0", "4cls_zenodo", "split_mixed", "weighted_full"),
    # ("exp04_4cls_weighted_res18",   "resnet18",        "4cls_zenodo", "split_mixed", "weighted_full"),
    # ("exp08_4cls_weighted_mob",     "mobilenet_v3",    "4cls_zenodo", "split_mixed", "weighted_full"),
    # ("exp10_4cls_weighted_res50",   "resnet50",        "4cls_zenodo", "split_mixed", "weighted_full"),

    # ── 4 clases — Undersampling ───────────────────────────────────────────
    # Pregunta: ¿undersampling mejora respecto a weighted en 4 clases?
    # ("exp06_4cls_under_eff",        "efficientnet_b0", "4cls_zenodo", "split_mixed", "undersampled"),
    # ("exp11_4cls_under_res18",      "resnet18",        "4cls_zenodo", "split_mixed", "undersampled"),

    # ── Mejor configuración: re-run con más epochs ─────────────────────────
    # Pregunta: ¿el ganador escala con más entrenamiento?
    # (completar experiment_id con el ganador una vez vistos los resultados)
    # ("exp12_best_extended",         "efficientnet_b0", "4cls_zenodo", "split_mixed", "weighted_full"),

    # ── Fase 2: Modelos Clean (Sin fondos planos) ─────────────────────────
    # Pregunta: ¿Cómo se comportan los modelos ahora que no pueden hacer trampa visual?
    ("exp13_3cls_weighted_eff_clean",     "efficientnet_b0", "3cls_zenodo", "split_mixed", "weighted_full"),
    ("exp14_3cls_weighted_res18_clean",   "resnet18",        "3cls_zenodo", "split_mixed", "weighted_full"),
    ("exp15_3cls_weighted_mob_clean",     "mobilenet_v3",    "3cls_zenodo", "split_mixed", "weighted_full"),
    ("exp16_3cls_weighted_res50_clean",   "resnet50",        "3cls_zenodo", "split_mixed", "weighted_full"),
    ("exp17_3cls_under_eff_clean",        "efficientnet_b0", "3cls_zenodo", "split_mixed", "undersampled"),
    ("exp18_4cls_weighted_eff_clean",     "efficientnet_b0", "4cls_zenodo", "split_mixed", "weighted_full"),
    ("exp19_4cls_weighted_res18_clean",   "resnet18",        "4cls_zenodo", "split_mixed", "weighted_full"),
    ("exp20_4cls_weighted_mob_clean",     "mobilenet_v3",    "4cls_zenodo", "split_mixed", "weighted_full"),
    ("exp21_4cls_weighted_res50_clean",   "resnet50",        "4cls_zenodo", "split_mixed", "weighted_full"),
    ("exp22_4cls_under_eff_clean",        "efficientnet_b0", "4cls_zenodo", "split_mixed", "undersampled"),
    ("exp23_4cls_under_res18_clean",      "resnet18",        "4cls_zenodo", "split_mixed", "undersampled"),
    ("exp24_best_extended_clean",         "efficientnet_b0", "4cls_zenodo", "split_mixed", "weighted_full"),
    ("exp25_4cls_agresivo_res18_clean",   "resnet18",        "4cls_zenodo", "split_mixed", "weighted_full"),
]


# ─── Limpieza de memoria GPU entre experimentos ────────────────────────────────

def _limpiar_memoria_gpu() -> None:
    """
    Libera la memoria de GPU entre experimentos.

    Sin esta limpieza, los tensores del modelo anterior pueden quedar
    en memoria y causar OOM en el siguiente experimento.
    """
    gc.collect()

    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
        print("  [GPU] Cache MPS liberado")
    elif torch.cuda.is_available():
        torch.cuda.empty_cache()
        print("  [GPU] Cache CUDA liberado")


# ─── Runner de un experimento ─────────────────────────────────────────────────

def correr_experimento(
    experiment_id:  str,
    model_name:     str,
    dataset_mode:   str,
    split_mode:     Optional[str],
    balancing_mode: str,
    wandb_enabled:  bool,
    dry_run:        bool = False,
) -> Optional[dict]:
    """
    Corre un único experimento.

    Args:
        experiment_id:  identificador único del experimento
        model_name:     "efficientnet_b0" o "resnet18"
        dataset_mode:   "3cls_no_zenodo", "3cls_zenodo" o "4cls_zenodo"
        split_mode:     None, "split_respected" o "split_mixed"
        balancing_mode: "weighted_full" o "undersampled"
        wandb_enabled:  True = loguear a W&B
        dry_run:        True = solo imprime, no ejecuta

    Returns:
        Dict con historial de métricas, o None en dry_run
    """
    print(f"\n{'═' * 70}")
    print(f"  EXPERIMENTO: {experiment_id}")
    print(f"  Modelo:      {model_name}")
    print(f"  Dataset:     {dataset_mode} | Split: {split_mode} | Balanceo: {balancing_mode}")
    print(f"  W&B:         {'sí' if wandb_enabled else 'no'}")
    print(f"{'═' * 70}")

    if dry_run:
        print("  [DRY RUN] No se ejecuta nada")
        return None

    try:
        history = train(
            experiment_id=experiment_id,
            dataset_mode=dataset_mode,
            split_mode=split_mode,
            balancing_mode=balancing_mode,
            model_name=model_name,
            num_epochs=NUM_EPOCHS,
            batch_size=BATCH_SIZE,
            learning_rate=LEARNING_RATE,
            device=DEVICE,
            wandb_enabled=wandb_enabled,
        )
        return history

    except Exception as e:
        print(f"\n  [ERROR] Experimento {experiment_id} falló: {e}")
        print(f"  Se continúa con el siguiente experimento...\n")
        return None

    finally:
        # Limpiar memoria entre experimentos, haya fallado o no
        _limpiar_memoria_gpu()


# ─── CLI ─────────────────────────────────────────────────────────────────────

def _listar_experimentos() -> None:
    """Imprime la tabla de todos los experimentos disponibles."""
    print(f"\n{'═' * 80}")
    print(f"  DetectVID — Experimentos disponibles ({len(EXPERIMENTS)} runs)")
    print(f"{'═' * 80}")
    print(f"  {'ID':<35} {'Modelo':<18} {'Dataset':<16} {'Split':<18} {'Balanceo'}")
    print(f"  {'─'*35} {'─'*18} {'─'*16} {'─'*18} {'─'*16}")
    for exp_id, model, dataset, split, balancing in EXPERIMENTS:
        split_str = split or "None"
        print(f"  {exp_id:<35} {model:<18} {dataset:<16} {split_str:<18} {balancing}")
    print(f"{'═' * 80}\n")


def _parsear_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Lanzador de experimentos W&B para DetectVID",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python src/experiments.py                              # todos los experimentos
  python src/experiments.py --experiment exp01_baseline_eff
  python src/experiments.py --no-wandb                  # sin tracking
  python src/experiments.py --list                      # ver experimentos
  python src/experiments.py --dry-run                   # simular sin ejecutar
        """,
    )

    parser.add_argument(
        "--experiment",
        type=str,
        default=None,
        metavar="ID",
        help="ID del experimento a correr (default: todos)",
    )
    parser.add_argument(
        "--no-wandb",
        action="store_true",
        default=False,
        help="Desactivar W&B (útil para debug local)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        default=False,
        help="Listar todos los experimentos y salir",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Mostrar qué correría sin ejecutar nada",
    )

    return parser.parse_args()


# ─── Entrypoint ───────────────────────────────────────────────────────────────

def main() -> None:
    args = _parsear_args()

    # ── Listar y salir ─────────────────────────────────────────────────────
    if args.list:
        _listar_experimentos()
        return

    wandb_enabled = not args.no_wandb
    dry_run       = args.dry_run

    # ── Seleccionar qué experimentos correr ────────────────────────────────
    if args.experiment is not None:
        # Buscar el experimento por ID
        experimentos_filtrados = [
            exp for exp in EXPERIMENTS if exp[0] == args.experiment
        ]
        if not experimentos_filtrados:
            ids_validos = [exp[0] for exp in EXPERIMENTS]
            print(f"[ERROR] Experimento '{args.experiment}' no encontrado.")
            print(f"        IDs válidos: {ids_validos}")
            sys.exit(1)
    else:
        experimentos_filtrados = EXPERIMENTS

    # ── Resumen antes de correr ────────────────────────────────────────────
    print(f"\n{'═' * 70}")
    print(f"  DetectVID — Sesión de experimentos")
    print(f"  Runs a ejecutar : {len(experimentos_filtrados)}")
    print(f"  Dispositivo     : {DEVICE.upper()}")
    print(f"  W&B             : {'activo (proyecto: ' + WANDB_PROJECT + ')' if wandb_enabled else 'desactivado'}")
    print(f"  Dry-run         : {'sí' if dry_run else 'no'}")
    print(f"{'═' * 70}\n")

    if dry_run:
        print("  [DRY RUN] Experimentos que se correrían:")
        for exp_id, model, dataset, split, balancing in experimentos_filtrados:
            split_str = split or "None"
            print(f"    - {exp_id} | {model} | {dataset} | {split_str} | {balancing}")
        print()
        return

    # ── Correr experimentos ────────────────────────────────────────────────
    exitosos  = []
    fallidos  = []

    for i, (exp_id, model_name, dataset_mode, split_mode, balancing_mode) in enumerate(experimentos_filtrados, 1):
        print(f"\n[{i}/{len(experimentos_filtrados)}] Iniciando: {exp_id}")

        history = correr_experimento(
            experiment_id=exp_id,
            model_name=model_name,
            dataset_mode=dataset_mode,
            split_mode=split_mode,
            balancing_mode=balancing_mode,
            wandb_enabled=wandb_enabled,
            dry_run=dry_run,
        )

        if history is not None:
            exitosos.append(exp_id)
        else:
            fallidos.append(exp_id)

    # ── Resumen final ──────────────────────────────────────────────────────
    print(f"\n{'═' * 70}")
    print(f"  Sesión finalizada")
    print(f"  Exitosos ({len(exitosos)}): {', '.join(exitosos) if exitosos else 'ninguno'}")
    if fallidos:
        print(f"  Fallidos ({len(fallidos)}): {', '.join(fallidos)}")
    print(f"{'═' * 70}\n")

    if wandb_enabled and exitosos:
        print(f"  Ver resultados en: https://wandb.ai/{WANDB_PROJECT}\n")


if __name__ == "__main__":
    main()
