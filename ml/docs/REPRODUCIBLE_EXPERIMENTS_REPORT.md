# DetectVID — reproducible experiment pipeline report

This report documents the reproducibility fixes added to the existing DetectVID ML pipeline. The goal is to compare future experiments on the same data split, with a fixed seed, persistent CSV artifacts, and validation-first model selection.

## What was wrong

| Problem | Impact |
|---|---|
| Splits were rebuilt from scanned folders for each run | Even with `RANDOM_SEED=42`, changing code/dataset order could silently change train/val/test composition. |
| Splits were not exported as first-class artifacts | It was hard to defend that experiments used exactly the same data. |
| Test evaluation happened inside the training loop | This risks using test results while choosing models. |
| Experiment logs were mostly histories/checkpoints | Missing a compact metadata record with seed, config, curves, confusion matrix and comparable summary. |
| Duplicate/similar image leakage was not audited | Same or near-same files could appear across train/val/test and inflate metrics. |

## What changed

### 1. Global reproducibility

The project keeps `RANDOM_SEED = 42` and now applies it more consistently:

- Python random
- NumPy
- PyTorch
- CUDA deterministic flags when available
- DataLoader shuffle generator
- DataLoader worker seeds

### 2. Persistent split CSVs

New active split artifacts are created under:

```text
/Users/stefanopalazzo/Projects/DetectVID/ml/splits/
```

For the current 8 field experiments, the active split version is `v3`:

```text
ml/splits/v3__4cls_field_curated__split_respected__seed42/
  train.csv
  val.csv
  test.csv
  metadata.json
  reports/

ml/splits/v3__4cls_field_broad_others__split_respected__seed42/
  train.csv
  val.csv
  test.csv
  metadata.json
  reports/
```

Each split CSV includes at least:

- `image_path`
- `label`

And also includes extra columns when available:

- `source`
- `domain`
- `split`

### 3. Future experiments read the same CSVs

`get_dataloaders()` now does this:

1. scans the dataset to know what currently exists
2. checks whether persistent split CSVs exist
3. if they exist: loads `train.csv`, `val.csv`, `test.csv`
4. if they do not exist: creates them once and reuses them thereafter

This keeps compatibility with the current flow while preventing each experiment from inventing a fresh split.

### 4. Leakage controls

When creating a split, the pipeline now deduplicates exact image content in the manifest and writes reports under `reports/`:

| Report | Purpose |
|---|---|
| `path_leakage.csv` | Same physical file path in multiple splits. |
| `exact_duplicate_hash_leakage.csv` | Same file content across splits after repair. Should be zero. |
| `exact_duplicate_groups_before_dedup.csv` | Exact duplicate content groups found before deduplication. |
| `dropped_exact_duplicates.csv` | Exact duplicate rows ignored by the split manifest; source files are not deleted. |
| `auto_repaired_exact_duplicate_groups.csv` | Safety report if any exact duplicates still needed split repair. |
| `similar_ahash_candidates.csv` | Visual similarity candidates by average hash; requires manual review. |
| `source_overlap_review.csv` | Sources appearing in more than one split; useful for source-level review. |
| `audit_summary.json` | Compact summary of the audit. |

### Current audit result

For `4cls_field_curated` v3:

- raw scanned images: `9426`
- exact duplicate rows ignored: `12`
- exact duplicate leakage after deduplication: `0`
- similar aHash candidates: `8`

For `4cls_field_broad_others` v3:

- raw scanned images: `11554`
- exact duplicate rows ignored: `824`
- exact duplicate leakage after deduplication: `0`
- similar aHash candidates: `124`

The broad-others dataset clearly needs more manual review. That matches previous model behavior: broad `others` hurt healthy classification.

### 5. Test is reserved

Training now evaluates validation artifacts by default. Test evaluation is optional:

```bash
python src/experiments.py --suite field_repro --evaluate-test
```

Do not use `--evaluate-test` while comparing candidate models. Use it only after selecting the final model from validation curves/metrics.

### 6. Experiment artifacts

Each future experiment now saves:

```text
ml/results/<experiment_id>_history.json
ml/results/<experiment_id>_training_curves.png
ml/results/<experiment_id>_val_confusion_matrix.csv
ml/results/<experiment_id>_val_confusion_matrix.png
ml/results/<experiment_id>_metrics.json
ml/results/<experiment_id>_metadata.json
ml/checkpoints/<experiment_id>_best.pth
ml/checkpoints/<experiment_id>_last.pth
```

And updates:

```text
ml/results/experiment_summary.csv
```

## How to run

### Prepare splits only

```bash
cd /Users/stefanopalazzo/Projects/DetectVID/ml
source .venv/bin/activate

python src/prepare_splits.py --dataset-mode 4cls_field_curated --split-mode split_respected
python src/prepare_splits.py --dataset-mode 4cls_field_broad_others --split-mode split_respected
```

### Repeat the 8 field experiments reproducibly

```bash
cd /Users/stefanopalazzo/Projects/DetectVID/ml
source .venv/bin/activate
python src/experiments.py --suite field_repro --no-wandb
```

This runs:

- `exp40_4cls_field_res18_weighted_repro_seed42`
- `exp41_4cls_field_eff_weighted_repro_seed42`
- `exp42_4cls_field_mob_weighted_repro_seed42`
- `exp43_4cls_field_res18_quality_aug_repro_seed42`
- `exp44_4cls_field_eff_quality_aug_repro_seed42`
- `exp45_4cls_field_res18_under_repro_seed42`
- `exp46_4cls_field_eff_under_repro_seed42`
- `exp47_4cls_field_broad_others_res18_quality_repro_seed42`

### Build comparison CSV/Markdown

```bash
cd /Users/stefanopalazzo/Projects/DetectVID/ml
source .venv/bin/activate
python src/summarize_experiments.py \
  --prefix exp4 \
  --output results/field_repro_candidate_summary.csv \
  --markdown results/field_repro_candidate_summary.md
```

After the reproducible runs finish, use the generated summary to compare them.

## How to choose the model

Do not pick only by accuracy.

Recommended validation-first priority:

1. lowest validation loss
2. healthy relation between train loss and validation loss
3. low overfitting evidence
4. strong validation macro-F1
5. class-level behavior from validation confusion matrix
6. accuracy only as secondary metric

The helper summary computes a `selection_score` where lower is better. Test metrics are intentionally not part of that score.

## Files changed

| File | Purpose |
|---|---|
| `ml/src/config.py` | Adds persistent split config, split version and audit flags. |
| `ml/src/dataset.py` | Adds persistent CSV splits, duplicate repair, leakage reports and deterministic DataLoader seed handling. |
| `ml/src/train.py` | Adds stronger seeding, validation-first artifacts, optional test evaluation, metadata and experiment summary logging. |
| `ml/src/experiments.py` | Adds `field_repro` suite and `--evaluate-test`. |
| `ml/src/experiment_tracking.py` | New local helper for curves, confusion matrix artifacts, JSON and summary CSV. |
| `ml/src/prepare_splits.py` | New CLI to create persistent splits without training. |
| `ml/src/summarize_experiments.py` | New CLI to compare experiments without using test metrics. |

## Current recommendation

Before rerunning, previous evidence still favored `exp44_4cls_field_eff_quality_aug` for production behavior on `mis-hojas`.

After rerunning with fixed `v2` splits, choose the final model from the new `*_repro_seed42` results using validation loss/curves/F1. Only then run final test evaluation on the selected checkpoint.
