"""
experiment_tracking.py — Utilities for reproducible DetectVID experiment records.

Keeps experiment logging local and CSV-friendly without replacing the existing
training flow or requiring new external tools.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, Optional

import numpy as np
import pandas as pd


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(v) for v in value]
    return value


def save_json(path: Path, data: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(to_jsonable(dict(data)), f, indent=2, ensure_ascii=False)


def plot_training_curves(history: Mapping[str, list], save_path: Path, title: str) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    epochs = range(1, len(history.get("train_loss", [])) + 1)
    if not list(epochs):
        return

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    axes[0].plot(epochs, history["train_loss"], "b-o", markersize=3, label="Train")
    axes[0].plot(epochs, history["val_loss"], "r-o", markersize=3, label="Validation")
    axes[0].set_title("Loss")
    axes[0].set_xlabel("Epoch")
    axes[0].set_ylabel("CrossEntropy loss")
    axes[0].grid(alpha=0.3)
    axes[0].legend()

    axes[1].plot(epochs, history["train_acc"], "b-o", markersize=3, label="Train")
    axes[1].plot(epochs, history["val_acc"], "r-o", markersize=3, label="Validation")
    axes[1].set_title("Accuracy")
    axes[1].set_xlabel("Epoch")
    axes[1].set_ylabel("Accuracy")
    axes[1].grid(alpha=0.3)
    axes[1].legend()

    if history.get("val_loss"):
        best_epoch = int(np.argmin(history["val_loss"])) + 1
        for ax in axes:
            ax.axvline(best_epoch, color="green", linestyle="--", alpha=0.6)

    fig.suptitle(title)
    plt.tight_layout()
    save_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(save_path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def save_confusion_matrix_artifacts(
    cm: np.ndarray,
    class_names: Iterable[str],
    csv_path: Path,
    png_path: Path,
    title: str,
) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    class_names = list(class_names)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(cm, index=class_names, columns=class_names).to_csv(csv_path)

    fig, ax = plt.subplots(figsize=(7, 6))
    im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
    fig.colorbar(im, ax=ax)
    ax.set_xticks(range(len(class_names)))
    ax.set_yticks(range(len(class_names)))
    ax.set_xticklabels(class_names, rotation=30, ha="right")
    ax.set_yticklabels(class_names)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title(title)

    threshold = cm.max() / 2 if cm.size and cm.max() > 0 else 0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, str(int(cm[i, j])), ha="center", va="center",
                    color="white" if cm[i, j] > threshold else "black")

    plt.tight_layout()
    png_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(png_path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def selection_score(row: Mapping[str, Any]) -> float:
    """
    Lower is better. Validation loss dominates; gap and F1 only adjust ties.
    Test metrics are intentionally not used.
    """
    val_loss = float(row.get("best_val_loss", row.get("val_loss", 999.0)) or 999.0)
    gap = float(row.get("best_generalization_gap", row.get("generalization_gap", 0.0)) or 0.0)
    val_f1 = float(row.get("val_f1_macro", 0.0) or 0.0)
    val_acc = float(row.get("best_val_acc", 0.0) or 0.0)
    overfit_penalty = max(0.0, gap) * 0.25
    return val_loss + overfit_penalty - (0.05 * val_f1) - (0.01 * val_acc)


def upsert_experiment_summary(summary_path: Path, row: Mapping[str, Any]) -> None:
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    clean_row = to_jsonable(dict(row))
    clean_row["selection_score"] = selection_score(clean_row)

    if summary_path.exists():
        df = pd.read_csv(summary_path)
        df = df[df["experiment_id"] != clean_row["experiment_id"]]
    else:
        df = pd.DataFrame()

    df = pd.concat([df, pd.DataFrame([clean_row])], ignore_index=True)
    sort_cols = [c for c in ["selection_score", "best_val_loss", "experiment_id"] if c in df.columns]
    if sort_cols:
        df = df.sort_values(sort_cols, ascending=True)
    df.to_csv(summary_path, index=False)
