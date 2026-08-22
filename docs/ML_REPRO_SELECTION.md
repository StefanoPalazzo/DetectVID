# DetectVID — reproducible field experiment selection

This note records the comparison between the strongest reproducible field experiments after retraining with persistent split CSVs and seed 42.

## Scope

Compared models:

- `exp44_4cls_field_eff_quality_aug_repro_seed42`
- `exp46_4cls_field_eff_under_repro_seed42`

The comparison intentionally prioritizes validation metrics and training curves. The small external `mis-hojas` set is useful as a sanity check, but it is not used as the formal selection criterion.

## Side-by-side comparison

| Metric | exp44 EfficientNet + quality augmentation | exp46 EfficientNet + undersampling | Better |
|---|---:|---:|---|
| Best epoch | 14 | 14 | tie |
| Best validation loss | 0.496898 | **0.494267** | exp46 |
| Validation accuracy at best epoch | 0.959011 | 0.959011 | tie |
| Validation evaluation accuracy | 0.958304 | **0.959717** | exp46 |
| Macro F1 | 0.951613 | **0.953629** | exp46 |
| Macro precision | 0.950158 | **0.954566** | exp46 |
| Macro recall | **0.953675** | 0.953618 | exp44, negligible |
| Best train loss | 0.452554 | **0.448990** | exp46 |
| Train/validation loss gap at best epoch | **0.044343** | 0.045277 | exp44, negligible |
| Final validation loss | **0.502159** | 0.506578 | exp44 |

## Per-class validation behavior

Class index mapping:

- `0`: healthy
- `1`: oidio
- `2`: peronospora
- `3`: others

| Class | Metric | exp44 | exp46 | Better |
|---|---|---:|---:|---|
| healthy | recall | 0.954545 | **0.965909** | exp46 |
| healthy | F1 | 0.935933 | **0.947075** | exp46 |
| oidio | recall | **0.912727** | 0.890909 | exp44 |
| oidio | F1 | **0.931354** | 0.924528 | exp44 |
| peronospora | recall | **0.985401** | 0.982968 | exp44, negligible |
| peronospora | F1 | 0.966587 | **0.969988** | exp46 |
| others | recall | 0.962025 | **0.974684** | exp46 |
| others | F1 | 0.972578 | **0.972924** | exp46, negligible |

## Decision

If the selection criterion is the reproducible validation protocol, `exp46_4cls_field_eff_under_repro_seed42` is the formal winner.

The configured deployment default remains `exp44_4cls_field_eff_quality_aug`. This is the existing product deployment decision, informed by the limited `mis-hojas` field sanity-check; it does not mean exp44 won the formal selection or field validation.

Rationale:

- lowest validation loss among all new reproducible field experiments;
- slightly higher validation accuracy than exp44 when evaluated from the saved best checkpoint;
- higher macro F1 and macro precision;
- better healthy recall and healthy F1, which matters for avoiding false disease alarms;
- same best epoch as exp44 and nearly identical train/validation loss gap.

`exp44_4cls_field_eff_quality_aug_repro_seed42` remains the best runner-up because it uses quality augmentation and has better oidio recall. If product behavior in real field photos becomes the priority, exp44 should remain under close consideration.

## Why the reproducible runs differ from the previous exp40-exp47 runs

The new runs are not byte-identical to the old runs even though they still use seed 42. A fixed seed guarantees repeatability only when the dataset manifest, ordering, split logic, augmentation RNG, and training implementation are the same.

The reproducible pipeline changed several conditions:

1. Persistent split CSVs are now used instead of reconstructing splits implicitly from folder scans.
2. Split version `v3` deduplicates exact image content in the trainable/evaluable manifest.
3. Exact duplicate rows are ignored, not deleted from source folders.
4. Leakage reports are generated for exact duplicates, similar images, path overlap, and source overlap.
5. DataLoader seeding is stronger and worker seeds are controlled.
6. Training now saves richer validation-first artifacts and reserves test evaluation for the final selected model.

Current v3 duplicate impact:

| Dataset mode | Raw scanned images | Persisted split paths | Exact duplicate rows ignored |
|---|---:|---:|---:|
| `4cls_field_curated` | 9426 | 9414 | 12 |
| `4cls_field_broad_others` | 11554 | 10730 | 824 |

Therefore, the new results are methodologically stronger but not expected to be identical to the old histories.

## Current formal ranking by validation loss

| Rank | Experiment | Best validation loss | Validation accuracy | Macro F1 |
|---:|---|---:|---:|---:|
| 1 | `exp46_4cls_field_eff_under_repro_seed42` | 0.494267 | 0.959717 | 0.953629 |
| 2 | `exp45_4cls_field_res18_under_repro_seed42` | 0.495577 | 0.955477 | 0.948009 |
| 3 | `exp44_4cls_field_eff_quality_aug_repro_seed42` | 0.496898 | 0.958304 | 0.951613 |
| 4 | `exp41_4cls_field_eff_weighted_repro_seed42` | 0.497563 | 0.956184 | 0.947570 |
| 5 | `exp43_4cls_field_res18_quality_aug_repro_seed42` | 0.502500 | 0.957597 | 0.951001 |
| 6 | `exp40_4cls_field_res18_weighted_repro_seed42` | 0.507972 | 0.959011 | 0.954423 |
| 7 | `exp47_4cls_field_broad_others_res18_quality_repro_seed42` | 0.524842 | 0.952592 | 0.945197 |
| 8 | `exp42_4cls_field_mob_weighted_repro_seed42` | 0.550060 | 0.918021 | 0.908016 |
