"""
evaluate.py — Evaluación completa del modelo sobre el test set

Genera:
- Matriz de confusión
- Reporte de clasificación (precision, recall, F1 por clase)
- Curvas ROC multiclase (One-vs-Rest)
- Gráficos de curvas de entrenamiento
- JSON con todas las métricas

Ejecutar desde src/:
    python evaluate.py
    python evaluate.py --checkpoint ../checkpoints/best_model.pth
"""

import sys
import json
import argparse
from pathlib import Path
from typing import List, Tuple

import torch
import torch.nn.functional as F
import numpy as np
import matplotlib
matplotlib.use("Agg")  # Backend no-interactivo para guardar figuras sin GUI
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick
from sklearn.metrics import (
    accuracy_score, confusion_matrix, classification_report,
    roc_curve, auc, precision_recall_curve, average_precision_score,
)

sys.path.insert(0, str(Path(__file__).parent))

from config import (
    DEVICE, BEST_MODEL_PATH, RESULTS_DIR, NUM_CLASSES,
    IDX_TO_CLASS, CLASS_DISPLAY_NAMES, BATCH_SIZE,
)
from dataset import get_dataloaders
from model import load_model


# ─── Inferencia sobre test set ────────────────────────────────────────────────

@torch.no_grad()
def run_inference(
    model:       torch.nn.Module,
    test_loader: torch.utils.data.DataLoader,
    device:      str,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Corre el modelo sobre todo el test set.
    Returns:
        y_true:  (N,)        — etiquetas reales
        y_pred:  (N,)        — predicciones (argmax)
        y_proba: (N, n_clases) — probabilidades softmax
    """
    model.eval()
    all_true  = []
    all_proba = []

    for images, labels in test_loader:
        images = images.to(device, non_blocking=True)
        logits = model(images)
        proba  = F.softmax(logits, dim=1)

        all_true.extend(labels.numpy())
        all_proba.extend(proba.cpu().numpy())

    y_true  = np.array(all_true)
    y_proba = np.array(all_proba)
    y_pred  = y_proba.argmax(axis=1)

    return y_true, y_pred, y_proba


# ─── Plots ────────────────────────────────────────────────────────────────────

def plot_confusion_matrix(
    y_true:      np.ndarray,
    y_pred:      np.ndarray,
    class_names: List[str],
    save_path:   Path,
) -> None:
    cm = confusion_matrix(y_true, y_pred)
    cm_normalized = cm.astype(float) / cm.sum(axis=1, keepdims=True)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    for ax, data, title, fmt in [
        (axes[0], cm,            "Matriz de Confusión (conteos)",         "d"),
        (axes[1], cm_normalized, "Matriz de Confusión (normalizada)", ".2f"),
    ]:
        im = ax.imshow(data, interpolation="nearest", cmap="Blues")
        plt.colorbar(im, ax=ax)
        ax.set_xticks(range(len(class_names)))
        ax.set_yticks(range(len(class_names)))
        ax.set_xticklabels(class_names, rotation=30, ha="right")
        ax.set_yticklabels(class_names)
        ax.set_xlabel("Predicción")
        ax.set_ylabel("Real")
        ax.set_title(title)

        thresh = data.max() / 2.0
        for i in range(data.shape[0]):
            for j in range(data.shape[1]):
                ax.text(j, i, format(data[i, j], fmt),
                        ha="center", va="center",
                        color="white" if data[i, j] > thresh else "black")

    plt.tight_layout()
    fig.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  ✓ Matriz de confusión guardada en {save_path}")


def plot_roc_curves(
    y_true:      np.ndarray,
    y_proba:     np.ndarray,
    class_names: List[str],
    save_path:   Path,
) -> dict:
    """Curvas ROC One-vs-Rest para clasificación multiclase."""
    from sklearn.preprocessing import label_binarize
    n_classes = len(class_names)

    y_bin = label_binarize(y_true, classes=list(range(n_classes)))

    fig, ax = plt.subplots(figsize=(8, 6))
    auc_scores = {}

    colors = ["#2196F3", "#FF5722", "#4CAF50"]
    for i, (cls_name, color) in enumerate(zip(class_names, colors)):
        fpr, tpr, _ = roc_curve(y_bin[:, i], y_proba[:, i])
        roc_auc = auc(fpr, tpr)
        auc_scores[cls_name] = roc_auc
        ax.plot(fpr, tpr, color=color, lw=2,
                label=f"{cls_name} (AUC = {roc_auc:.3f})")

    ax.plot([0, 1], [0, 1], "k--", lw=1, label="Clasificador aleatorio")
    ax.set_xlim([0.0, 1.0])
    ax.set_ylim([0.0, 1.05])
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("Curvas ROC — One vs Rest")
    ax.legend(loc="lower right")
    ax.grid(alpha=0.3)

    plt.tight_layout()
    fig.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  ✓ Curvas ROC guardadas en {save_path}")
    return auc_scores


def plot_training_curves(history_path: Path, save_path: Path) -> None:
    """Grafica loss y accuracy de train/val por época."""
    if not history_path.exists():
        print(f"  [!] No se encontró {history_path} — salteando curvas de entrenamiento")
        return

    with open(history_path) as f:
        history = json.load(f)

    epochs = range(1, len(history["train_loss"]) + 1)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # Loss
    axes[0].plot(epochs, history["train_loss"], "b-o", markersize=3, label="Train")
    axes[0].plot(epochs, history["val_loss"],   "r-o", markersize=3, label="Val")
    axes[0].set_title("Loss por época")
    axes[0].set_xlabel("Época")
    axes[0].set_ylabel("CrossEntropy Loss")
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    # Accuracy
    axes[1].plot(epochs, history["train_acc"], "b-o", markersize=3, label="Train")
    axes[1].plot(epochs, history["val_acc"],   "r-o", markersize=3, label="Val")
    axes[1].set_title("Accuracy por época")
    axes[1].set_xlabel("Época")
    axes[1].set_ylabel("Accuracy")
    axes[1].yaxis.set_major_formatter(mtick.PercentFormatter(xmax=1.0))
    axes[1].legend()
    axes[1].grid(alpha=0.3)

    # Indicar la época con mejor val_loss
    best_epoch = int(np.argmin(history["val_loss"])) + 1
    for ax in axes:
        ax.axvline(x=best_epoch, color="green", linestyle="--", alpha=0.7, label=f"Mejor época ({best_epoch})")

    plt.tight_layout()
    fig.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  ✓ Curvas de entrenamiento guardadas en {save_path}")


# ─── Evaluación principal ─────────────────────────────────────────────────────

def evaluate(checkpoint_path: Path = BEST_MODEL_PATH) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f" DetectVID — Evaluación")
    print(f" Dispositivo: {DEVICE.upper()}")
    print(f"{'='*60}\n")

    # ── Datos ─────────────────────────────────────────────────────────────────
    _, _, test_loader, _ = get_dataloaders(batch_size=BATCH_SIZE)

    # ── Detectar modelo del checkpoint ─────────────────────────────────────────
    checkpoint = torch.load(str(checkpoint_path), map_location=DEVICE, weights_only=False)
    model_name = "efficientnet_b0"  # default
    if isinstance(checkpoint, dict):
        model_name = checkpoint.get("model_name", "efficientnet_b0")

    # ── Modelo ────────────────────────────────────────────────────────────────
    model = load_model(str(checkpoint_path), model_name=model_name, device=DEVICE)

    # ── Inferencia ────────────────────────────────────────────────────────────
    print("\n[Evaluate] Corriendo inferencia sobre test set...")
    y_true, y_pred, y_proba = run_inference(model, test_loader, DEVICE)

    # ── Nombres para los plots ─────────────────────────────────────────────────
    class_names = [CLASS_DISPLAY_NAMES[IDX_TO_CLASS[i]] for i in range(NUM_CLASSES)]

    # ── Métricas escalares ────────────────────────────────────────────────────
    accuracy = accuracy_score(y_true, y_pred)
    report   = classification_report(
        y_true, y_pred,
        target_names=class_names,
        output_dict=True,
    )

    print(f"\n[Evaluate] Accuracy general: {accuracy:.4f} ({accuracy*100:.2f}%)")
    print("\n[Evaluate] Reporte por clase:")
    print(classification_report(y_true, y_pred, target_names=class_names, digits=4))

    # ── Plots ─────────────────────────────────────────────────────────────────
    print("[Evaluate] Generando visualizaciones...")

    plot_confusion_matrix(
        y_true, y_pred, class_names,
        save_path=RESULTS_DIR / "confusion_matrix.png",
    )

    auc_scores = plot_roc_curves(
        y_true, y_proba, class_names,
        save_path=RESULTS_DIR / "roc_curves.png",
    )

    plot_training_curves(
        history_path=RESULTS_DIR / "training_history.json",
        save_path=RESULTS_DIR / "training_curves.png",
    )

    # ── Guardar métricas completas ────────────────────────────────────────────
    metrics = {
        "accuracy": float(accuracy),
        "auc_scores": {k: float(v) for k, v in auc_scores.items()},
        "classification_report": report,
    }
    metrics_path = RESULTS_DIR / "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    print(f"\n[Evaluate] Métricas completas guardadas en {metrics_path}")
    print(f"\n{'='*60}")
    print(f" RESUMEN FINAL")
    print(f"{'='*60}")
    print(f"  Accuracy:           {accuracy*100:.2f}%")
    for cls, score in auc_scores.items():
        print(f"  AUC {cls:<25} {score:.4f}")
    print(f"{'='*60}\n")


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluar modelo DetectVID")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=BEST_MODEL_PATH,
        help="Ruta al checkpoint .pth del modelo",
    )
    args = parser.parse_args()
    evaluate(checkpoint_path=args.checkpoint)
