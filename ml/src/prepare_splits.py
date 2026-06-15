#!/usr/bin/env python3
"""Create/export persistent train/val/test CSVs without training a model."""

from __future__ import annotations

import argparse
from pathlib import Path

from dataset import build_dataframe_for_experiment, load_or_create_persistent_splits, print_split_stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-mode", default="4cls_field_curated")
    parser.add_argument("--split-mode", default="split_respected")
    args = parser.parse_args()

    split_mode = None if args.split_mode.lower() in {"none", "null"} else args.split_mode
    df = build_dataframe_for_experiment(args.dataset_mode, split_mode)
    train_df, val_df, test_df, artifacts = load_or_create_persistent_splits(df, args.dataset_mode, split_mode)
    print_split_stats(train_df, val_df, test_df)
    print("Split artifacts:")
    for key, value in artifacts.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
