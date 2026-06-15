# DetectVID — datasets, field modes and duplicates explained

This document explains the difference between `4cls_field_curated` and `4cls_field_broad_others`, and what happened with duplicate images.

## Quick answer

- `4cls_field_curated` is the safer production-oriented dataset.
- `4cls_field_broad_others` is a stress test with a much broader/noisier `others` class.
- Exact duplicate image files should not count twice for training/evaluation.
- The pipeline now ignores exact duplicate rows in the split manifest, but does not delete source files.

## 1. What is `4cls_field_curated`?

This mode includes close-up sources that match the expected app input.

Classes:

```text
healthy
oidio
peronospora
others
```

It excludes:

- distant healthy canopy photos
- lab flat-background leaves
- low-quality/not-suitable folders
- the `grapes` dataset
- broad GVLID disease folders in `others`

Use this as the main production candidate.

## 2. What is `4cls_field_broad_others`?

This is the same idea, but it adds extra broad disease sources into `others`, especially `gvlid_*` disease folders.

Purpose:

> Test whether a broader `others` class improves rejection of unknown diseases.

Risk:

> If `others` is too broad/noisy/out-of-domain, it can confuse healthy and disease boundaries.

This is exactly what previous results suggested: broad `others` hurt healthy behavior.

## 3. Why exact duplicates are a problem

If the exact same image appears in train and validation:

```text
train: image_A.jpg
val: same pixels but image_B.jpg
```

Then validation is no longer a fair test. The model may have already seen the answer.

If the exact same image appears twice in train:

```text
train: image_A.jpg
train: same pixels as image_B.jpg
```

Then that visual example gets overweighted. It is not leakage, but it is still undesirable.

## 4. Did we delete duplicates?

No. Source files were not deleted.

Instead, the pipeline now deduplicates the manifest used for training/evaluation:

```text
source dataset remains untouched
split CSV keeps one representative image per exact SHA256
extra exact duplicates are reported and ignored
```

This is safer because:

- no irreversible dataset deletion
- audit trail remains
- training/evaluation becomes cleaner

## 5. How many duplicates were found?

Current active split version: `v3`.

| Dataset mode | Raw images | Exact duplicate rows ignored | Approx. impact |
|---|---:|---:|---:|
| `4cls_field_curated` | 9426 | 12 | ~0.13% |
| `4cls_field_broad_others` | 11554 | 824 | ~7.13% |

Interpretation:

- curated has very few exact duplicates, so it is mostly clean
- broad_others has many exact duplicates, mostly because the added broad sources are noisier/redundant

## 6. What about similar images?

The pipeline also reports aHash candidates.

These are not guaranteed duplicates. They mean “visually very similar according to a simple perceptual hash”.

Current v3:

| Dataset mode | Similar aHash candidates |
|---|---:|
| `4cls_field_curated` | 8 |
| `4cls_field_broad_others` | 124 |

These should be manually reviewed, not automatically deleted.

## 7. Why not remove all similar images automatically?

Because near-duplicates can be legitimate:

- same leaf from a slightly different angle
- same disease but different crop
- visually similar leaves from different plants
- images with subtle disease region differences

Automatic deletion could remove useful variation.

## 8. Where are the reports?

```text
ml/splits/v3__4cls_field_curated__split_respected__seed42/reports/
ml/splits/v3__4cls_field_broad_others__split_respected__seed42/reports/
```

Important files:

```text
exact_duplicate_groups_before_dedup.csv
dropped_exact_duplicates.csv
similar_ahash_candidates.csv
audit_summary.json
```

## 9. Should we train with broad_others?

Use it as an experiment, not as the default.

Current recommendation:

- main candidate: `4cls_field_curated`
- diagnostic/stress-test: `4cls_field_broad_others`

If broad_others lowers healthy recall or increases false disease positives, reject it.
