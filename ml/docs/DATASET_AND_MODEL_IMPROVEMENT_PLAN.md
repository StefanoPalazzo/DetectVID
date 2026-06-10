# DetectVID dataset and model improvement plan

## Current production assumption

DetectVID should classify close-up grapevine leaf or grape images. Distant canopy photos should not be treated as clean `healthy` examples because they teach the model a broader visual domain than the product actually accepts.

## Target label contract

Use four accepted classes plus an inference-only uncertainty decision:

- `healthy`: close-up healthy grapevine leaf/grape tissue with no visible disease symptoms.
- `oidio`: powdery mildew symptoms.
- `peronospora`: downy mildew symptoms.
- `others`: valid close-up plant image, but symptoms do not match the target diseases or look like another disease/damage.
- `uncertain`: inference decision when confidence or top-1 margin is too low. This is not a training class unless a future image-quality model is added.

## Dataset actions

1. Move distant/canopy healthy photos out of the training `healthy` class.
   - Keep them as `not_suitable` or `healthy_distance_or_canopy` for a future image-quality/re-take classifier.
2. Build a close-up healthy holdout set before retraining.
   - Include young leaves, mature leaves, shadows, mild backlight, and phone-camera variability.
   - Exclude autumn, burn, nutrient deficiency, pest damage, and watermark-heavy images from `healthy`.
3. Keep `others` broad but valid.
   - Include black rot, esca, leaf blight, bacterial rot/spot, sunburn, autumn/senescence, nutrient deficiency, mechanical damage, and ambiguous symptoms.
4. Use source-aware evaluation.
   - Do not rely only on random splits. Add a source/date/session holdout and the `mis-hojas` internet sanity set.
5. Add failure review after every experiment.
   - Save false healthy, false disease, high-confidence wrong predictions, and uncertain predictions for manual inspection.

## Useful external datasets

- Niphad Grape Leaf Disease Dataset (NGLD), Mendeley Data, CC BY 4.0: 2,726 mobile-phone table-grape leaf images with Downy Mildew, Bacterial Rot, Powdery Mildew, and Healthy Leaves. DOI: 10.17632/8nnd2ypcv3.4
- HERMOS, Mendeley Data, CC BY 4.0: 914 grapevine images with bounding boxes for powdery mildew, downy mildew, dead arm/root, and healthy leaves. DOI: 10.17632/j4xs3kh3fd.2
- IDADP grape disease dataset, Science Data Bank: 3,622 images across seven grape disease categories including powdery mildew and downy mildew.
- Roboflow Grape leaf disease dataset, CC BY 4.0: 1,598 object-detection images with Healthy, Black Measles, Black Rot, and Blight Fungus.
- Kaggle Grapevine Disease Dataset Original: 9,027 images with Black Rot, Esca, Leaf Blight, and Healthy. Useful mostly for `others` and healthy variation, not for the two target mildew classes.

## Paper-driven implementation guidance

1. Data distribution beats architecture search right now.
   - The transformer paper highlights small-sample imbalance, subtle disease features, and weak traditional augmentation as core problems. DetectVID shows the same symptom: healthy close-up generalization is weak despite high internal metrics.
2. Use uncertainty and abstention.
   - The app must not force low-confidence predictions into healthy/disease classes. Current code now adds confidence and margin thresholds.
3. Prefer source-aware validation.
   - High internal accuracy from random splits is not enough when internet/field holdouts fail.
4. Add interpretability/failure QA.
   - Use Grad-CAM or similar saliency maps to check whether the model attends to disease lesions instead of background, watermark, hand, sky, or leaf shape shortcuts.
5. Segmentation/cropping is more useful than color filters.
   - K-means/color-space papers show lesion segmentation can isolate symptomatic areas. For DetectVID, first add leaf/grape close-up quality control and optional leaf/cluster crop before trying artificial filters.
6. Treat generative augmentation carefully.
   - GAN/FastGAN-style augmentation can help small classes, but only after the real dataset is clean. Synthetic healthy/disease images should never replace external real holdout validation.

## Next experiment batch

Run after dataset cleanup:

1. `4cls_closeup_res18_weighted`: ResNet18, four classes, close-up-only healthy, source-aware split.
2. `4cls_closeup_eff_weighted`: EfficientNet-B0, same data split.
3. `4cls_closeup_res18_quality_aug`: ResNet18 with mild blur, exposure, crop, shadow, and no aggressive color distortion.
4. `4cls_closeup_eff_quality_aug`: EfficientNet-B0 with the same augmentation.

Primary metrics:

- Healthy recall on close-up external holdout.
- High-confidence false disease rate on healthy images.
- Oidio/peronospora recall separately.
- `others` false acceptance rate.
- Uncertain rate and accepted-only accuracy.

## Implementation status update

This plan is now partially implemented in code:

- `4cls_closeup` dataset mode is available and scans only `Datasets/<class>/closeup/<source>/`.
- `not_suitable/` and `IGNORED_flat_backgrounds/` are excluded from training scans.
- `src/experiments.py --suite closeup` exposes the four close-up experiments without running them by default.
- `ml/scripts/import_pascal_voc_dataset.py` can import Pascal/VOC XML datasets such as HERMOS after the zip is fully available.
- See `ml/docs/DATASET_CURATION_GUIDE.md` for exact folder placement and commands.
