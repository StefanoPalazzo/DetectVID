# DetectVID Dataset Curation Guide

## Goal

DetectVID is intended for field use with close-up grapevine leaf or grape photos. Training should prioritize images that resemble production captures: one leaf, a clear leaf region, or a grape cluster close enough to diagnose disease signs.

## Folder structure

Use these folders for curated data:

```text
Datasets/
  healthy/
    closeup/<source_name>/
    distant_or_canopy/<source_name>/
  oidio/
    closeup/<source_name>/
  peronospora/
    closeup/<source_name>/
  otros/
    closeup/<source_name>/
  not_suitable/
    distant_or_canopy/<source_name>/
    flat_background/<source_name>/
    low_quality/<source_name>/
  IGNORED_flat_backgrounds/
  _raw_imports/
  _extracted/
  _reports/
```

`source_name` should be stable and readable, for example `HERMOS`, `NGLD`, `internet_sanity`, or `field_mendoza_2026_06`.

## What goes where

- `healthy/closeup/<source>/`: close-up healthy grapevine leaves or grapes with no visible disease symptoms.
- `oidio/closeup/<source>/`: close-up powdery mildew symptoms.
- `peronospora/closeup/<source>/`: close-up downy mildew symptoms.
- `otros/closeup/<source>/`: valid close-up plant images with other disease, pest, nutrient, burn, autumn/senescence, or ambiguous non-target symptoms.
- `not_suitable/distant_or_canopy/<source>/`: vineyard/canopy/distant photos not useful for diagnosis.
- `not_suitable/flat_background/<source>/`: lab-like or perfect-background images. Keep them for controlled tests, not main field training.
- `not_suitable/low_quality/<source>/`: blurry, heavy watermark, text overlay, bad exposure, or unusable images.

Do not delete rejected images. Move/copy them to the right non-training bucket so the decision is auditable.

## Flat backgrounds

Keeping `IGNORED_flat_backgrounds` out of the main training set is correct for field deployment. Flat backgrounds can inflate metrics because the model may learn lab/background shortcuts instead of disease signs. Use them only for controlled comparison experiments.

## Importing the XML leaf dataset

When `j4xs3kgh3fd-2.zip` is fully downloaded and no longer ends in `.crdownload`:

```bash
cd /Users/stefanopalazzo/Desktop/Universidad/DetectVID
python ml/scripts/import_pascal_voc_dataset.py \
  --zip ~/Downloads/j4xs3kgh3fd-2.zip \
  --source-name HERMOS
```

That command is a dry-run. To actually copy/extract:

```bash
python ml/scripts/import_pascal_voc_dataset.py \
  --zip ~/Downloads/j4xs3kgh3fd-2.zip \
  --source-name HERMOS \
  --apply
```

The importer:

- copies the zip into `Datasets/_raw_imports/`
- extracts into `Datasets/_extracted/HERMOS/`
- reads XML object labels
- copies images into close-up class folders
- writes `Datasets/_reports/import_HERMOS.csv`
- flags multi-class/tie cases with `needs_review=True`

## Running close-up experiments

After each of the four class folders has images under `closeup`, list the prepared experiments:

```bash
cd ml
python src/experiments.py --suite closeup --list
```

Dry-run the close-up suite:

```bash
python src/experiments.py --suite closeup --dry-run --no-wandb
```

Run a single experiment first:

```bash
python src/experiments.py \
  --suite closeup \
  --experiment 4cls_closeup_res18_weighted \
  --no-wandb
```

Do not run the full suite until `Datasets/<class>/closeup/<source>/` has been manually curated.

## iCloud checks

Before importing a zip:

```bash
ls -lh ~/Downloads/*.zip
unzip -t ~/Downloads/j4xs3kgh3fd-2.zip
```

A usable file must:

- not end in `.crdownload`
- stop changing size for several minutes
- pass `unzip -t`
- not show a Finder cloud icon waiting to download
