#!/usr/bin/env python3
"""
summarize_experiments.py — Build a comparable experiment summary without using test.

Selection criterion:
1. lower validation loss dominates
2. smaller train/validation loss gap is better
3. higher validation macro-F1 is better
4. accuracy is secondary
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from config import RESULTS_DIR
from experiment_tracking import selection_score


def _load_json(path: Path) -> Dict[str, Any]:
    with open(path) as f:
        return json.load(f)


def _row_from_metadata(path: Path) -> Dict[str, Any]:
    payload = _load_json(path)
    row = dict(payload.get("experiment", {}))
    row.setdefault("metadata_path", str(path))
    row["selection_score"] = selection_score(row)
    return row


def _row_from_history(path: Path) -> Dict[str, Any]:
    history = _load_json(path)
    n = len(history.get("val_loss", []))
    if n == 0:
        return {}
    best_idx = int(np.argmin(history["val_loss"]))
    row = {
        "experiment_id": path.stem.replace("_history", ""),
        "epochs_ran": n,
        "best_epoch": best_idx + 1,
        "best_val_loss": float(history["val_loss"][best_idx]),
        "best_val_acc": float(history["val_acc"][best_idx]),
        "best_train_loss": float(history["train_loss"][best_idx]),
        "best_train_acc": float(history["train_acc"][best_idx]),
        "best_generalization_gap": float(history["val_loss"][best_idx] - history["train_loss"][best_idx]),
        "history_path": str(path),
        "source": "history_only",
    }
    row["selection_score"] = selection_score(row)
    return row


def build_summary(results_dir: Path = RESULTS_DIR, prefix: str | None = None) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    seen = set()

    for metadata_path in sorted(results_dir.glob("*_metadata.json")):
        row = _row_from_metadata(metadata_path)
        exp_id = row.get("experiment_id")
        if not exp_id:
            continue
        if prefix and not exp_id.startswith(prefix):
            continue
        row["source"] = "metadata"
        rows.append(row)
        seen.add(exp_id)

    for history_path in sorted(results_dir.glob("*_history.json")):
        exp_id = history_path.stem.replace("_history", "")
        if exp_id in seen:
            continue
        if prefix and not exp_id.startswith(prefix):
            continue
        row = _row_from_history(history_path)
        if row:
            rows.append(row)

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    for col in ["selection_score", "best_val_loss", "best_generalization_gap"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    sort_cols = [c for c in ["selection_score", "best_val_loss", "experiment_id"] if c in df.columns]
    return df.sort_values(sort_cols, ascending=True).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", type=Path, default=RESULTS_DIR)
    parser.add_argument("--prefix", type=str, default=None, help="Optional experiment_id prefix filter")
    parser.add_argument("--output", type=Path, default=RESULTS_DIR / "experiment_summary.csv")
    parser.add_argument("--markdown", type=Path, default=RESULTS_DIR / "experiment_summary.md")
    args = parser.parse_args()

    df = build_summary(args.results_dir, args.prefix)
    if df.empty:
        print("No experiment results found.")
        return

    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)

    display_cols = [
        c for c in [
            "experiment_id", "selection_score", "best_val_loss", "best_val_acc",
            "best_generalization_gap", "val_f1_macro", "epochs_ran", "best_epoch",
            "model_name", "dataset_mode", "balancing_mode", "split_key",
        ]
        if c in df.columns
    ]
    md_df = df[display_cols].copy()
    md_df = md_df.fillna("")
    with open(args.markdown, "w") as f:
        f.write("# DetectVID experiment summary\n\n")
        f.write("Sorted by selection score. Test metrics are intentionally not used for selection.\n\n")
        f.write("| " + " | ".join(display_cols) + " |\n")
        f.write("|" + "|".join(["---"] * len(display_cols)) + "|\n")
        for _, row in md_df.iterrows():
            f.write("| " + " | ".join(str(row[col]) for col in display_cols) + " |\n")

    best = df.iloc[0]
    print(f"Saved CSV: {args.output}")
    print(f"Saved Markdown: {args.markdown}")
    print(f"Best by validation-first criterion: {best['experiment_id']}")


if __name__ == "__main__":
    main()
