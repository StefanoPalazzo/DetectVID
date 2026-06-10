# DetectVID night field experiments

These experiments are designed for the current production assumption: users upload close-up field photos of grapevine leaves or grape clusters/leaves, not distant canopy photos and not lab-flat-background leaves.

## Dataset rules encoded in code

Trainable close-up sources:

- `Datasets/healthy/coco_healthy/`
- `Datasets/healthy/zenodo2_Healthy/`
- `Datasets/oidio/zenodo2_Powdery Mildew/`
- `Datasets/oidio/白粉病 - oidio/`
- `Datasets/peronospora/zenodo2_Downy Mildew/`
- `Datasets/peronospora/霜霉病 - peronospora/`
- selected `Datasets/otros/zenodo2_*` and Chinese disease folders
- existing `Datasets/<class>/closeup/` folders, if manually curated images are placed there

Preserved-split sources:

- `Datasets/oidio/zenodo_oidio/`
- `Datasets/peronospora/zenodo_peronospora/`
- `Datasets/otros/zenodo_others/`

Excluded from main training:

- `Datasets/healthy/esca_field_healthy/`
- `Datasets/healthy/gvlid_healthy/`
- `Datasets/IGNORED_flat_backgrounds/`
- `Datasets/not_suitable/`
- `Datasets/grapes/`

`4cls_field_broad_others` is the only controlled variant that includes `Datasets/otros/gvlid_*` as broad `others`; healthy GVLID stays excluded.

## Experiments

Run the curated night suite:

```bash
cd /Users/stefanopalazzo/Projects/DetectVID/ml
source .venv/bin/activate
python src/experiments.py --suite field
```

List first if you want to verify without training:

```bash
cd /Users/stefanopalazzo/Projects/DetectVID/ml
source .venv/bin/activate
python src/experiments.py --suite field --list
python src/experiments.py --suite field --dry-run
```

The suite contains 8 runs:

1. `exp40_4cls_field_res18_weighted`
2. `exp41_4cls_field_eff_weighted`
3. `exp42_4cls_field_mob_weighted`
4. `exp43_4cls_field_res18_quality_aug`
5. `exp44_4cls_field_eff_quality_aug`
6. `exp45_4cls_field_res18_under`
7. `exp46_4cls_field_eff_under`
8. `exp47_4cls_field_broad_others_res18_quality`

## Why these runs

- ResNet18: fast baseline, useful for iteration.
- EfficientNet-B0: strong transfer-learning baseline.
- MobileNet-V3: lightweight candidate for deployment.
- Quality augmentation: moderate field robustness without destroying mildew texture/color cues.
- Undersampling: checks whether weighted loss is overfitting to majority sources/classes.
- Broad others: tests if adding `gvlid_*` disease images to `others` helps rejection or hurts close-up disease precision.

Do not judge only by global accuracy. Prioritize:

- healthy close-up recall
- disease false positives on healthy close-ups
- oidio recall
- peronospora recall
- `others` rate on unknown disease sources
- source-level confusion matrix / W&B source reports when available
- manual sanity check with `/Users/stefanopalazzo/Desktop/mis-hojas`
