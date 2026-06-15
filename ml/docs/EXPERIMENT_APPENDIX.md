# DetectVID — catálogo completo de experimentos

Este apéndice documenta los experimentos que tienen historial guardado en `/Users/stefanopalazzo/Projects/DetectVID/ml/results`.

## Cómo leer este archivo

- **Qué hace**: describe la intención del experimento
- **Qué cambia**: variable principal respecto de su familia
- **Épocas corridas**: épocas efectivamente ejecutadas según el `*_history.json`
- **Mejor val acc / loss**: mejor punto del entrenamiento guardado

Para el resumen tabular completo generado automáticamente, ver:

- `/Users/stefanopalazzo/Projects/DetectVID/ml/results/experiment_history_summary.csv`

---

## 1. Familia baseline (`exp01`–`exp12`)

| ID | Qué hace | Qué cambia | Épocas | Mejor val acc | Mejor val loss |
|---|---|---|---:|---:|---:|
| `exp01_3cls_weighted_eff` | baseline 3 clases con EfficientNet-B0 | arquitectura base | 15 | 0.9921 | 0.3647 |
| `exp02_3cls_weighted_res18` | baseline 3 clases con ResNet18 | arquitectura | 15 | 0.9882 | 0.3800 |
| `exp03_4cls_weighted_eff` | 4 clases con EfficientNet-B0 | agrega `others` | 15 | 0.9906 | 0.5633 |
| `exp04_4cls_weighted_res18` | 4 clases con ResNet18 | arquitectura + `others` | 15 | 0.9872 | 0.5801 |
| `exp05_3cls_under_eff` | 3 clases con undersampling | balanceo | 15 | 0.9900 | 0.3378 |
| `exp06_4cls_under_eff` | 4 clases con undersampling | balanceo + `others` | 15 | 0.9877 | 0.4974 |
| `exp07_3cls_weighted_mob` | 3 clases con MobileNet-V3 | arquitectura liviana | 15 | 0.9834 | 0.3848 |
| `exp08_4cls_weighted_mob` | 4 clases con MobileNet-V3 | arquitectura liviana + `others` | 15 | 0.9773 | 0.5913 |
| `exp09_3cls_weighted_res50` | 3 clases con ResNet50 | arquitectura más grande | 15 | 0.9882 | 0.3697 |
| `exp10_4cls_weighted_res50` | 4 clases con ResNet50 | arquitectura + `others` | 15 | 0.9883 | 0.5745 |
| `exp11_4cls_under_res18` | 4 clases con ResNet18 undersampled | balanceo + arquitectura | 15 | 0.9850 | 0.5037 |
| `exp12_best_extended` | reuso del ganador baseline | almacenamiento idéntico a `exp03` | 15 | 0.9906 | 0.5633 |

### Nota importante
`exp12_best_extended_history.json` es exactamente igual a `exp03_4cls_weighted_eff_history.json` en este repo.

---

## 2. Familia clean (`exp13`–`exp25`)

| ID | Qué hace | Qué cambia | Épocas | Mejor val acc | Mejor val loss |
|---|---|---|---:|---:|---:|
| `exp13_3cls_weighted_eff_clean` | 3 clases clean con EfficientNet | excluye shortcuts obvios | 15 | 0.9839 | 0.3291 |
| `exp14_3cls_weighted_res18_clean` | 3 clases clean con ResNet18 | arquitectura | 15 | 0.9801 | 0.3369 |
| `exp15_3cls_weighted_mob_clean` | 3 clases clean con MobileNet | arquitectura liviana | 15 | 0.9701 | 0.3571 |
| `exp16_3cls_weighted_res50_clean` | 3 clases clean con ResNet50 | arquitectura más grande | 15 | 0.9855 | 0.3313 |
| `exp17_3cls_under_eff_clean` | 3 clases clean undersampled | balanceo | 15 | 0.9839 | 0.3315 |
| `exp18_4cls_weighted_eff_clean` | 4 clases clean con EfficientNet | agrega `others` en clean | 15 | 0.9860 | 0.4296 |
| `exp19_4cls_weighted_res18_clean` | 4 clases clean con ResNet18 | arquitectura | 15 | 0.9838 | 0.4304 |
| `exp20_4cls_weighted_mob_clean` | 4 clases clean con MobileNet | arquitectura liviana | 15 | 0.9655 | 0.4701 |
| `exp21_4cls_weighted_res50_clean` | 4 clases clean con ResNet50 | arquitectura más grande | 15 | 0.9808 | 0.4322 |
| `exp22_4cls_under_eff_clean` | 4 clases clean undersampled | balanceo | 15 | 0.9790 | 0.4174 |
| `exp23_4cls_under_res18_clean` | 4 clases clean undersampled con ResNet18 | balanceo + arquitectura | 15 | 0.9712 | 0.4242 |
| `exp24_best_extended_clean` | reuso del ganador clean | almacenamiento idéntico a `exp18` | 15 | 0.9860 | 0.4296 |
| `exp25_4cls_agresivo_res18_clean` | primera prueba clean con augmentation agresivo | crop/agresión visual mayor | 15 | 0.9747 | 0.4459 |

### Nota importante
`exp24_best_extended_clean_history.json` es exactamente igual a `exp18_4cls_weighted_eff_clean_history.json` en este repo.

---

## 3. Familia aggressive augmentation (`exp28`–`exp30`)

| ID | Qué hace | Qué cambia | Épocas reales | Mejor val acc | Mejor val loss |
|---|---|---|---:|---:|---:|
| `exp28_4cls_agresivo_mild_color_clean` | crop agresivo + color leve | `color_jitter` suave y más épocas máximas | 22 | 0.9764 | 0.4552 |
| `exp29_4cls_agresivo_local_sun_clean` | crop agresivo + glare local | `local_sun_glare` y más épocas máximas | 37 | 0.9747 | 0.4435 |
| `exp30_4cls_agresivo_blur_clean` | crop agresivo + blur | `gaussian_blur` y más épocas máximas | 36 | 0.9756 | 0.4502 |

### Qué estaba probando esta familia
No estaba cambiando el dataset base principal sino la robustez visual del entrenamiento.

### Observación importante
Estos experimentos usan overrides de `NUM_EPOCHS=50`, pero early stopping cortó antes.

---

## 4. Familia field / producción (`exp40`–`exp47`)

| ID | Qué hace | Qué cambia | Épocas | Mejor val acc | Mejor val loss |
|---|---|---|---:|---:|---:|
| `exp40_4cls_field_res18_weighted` | baseline field con ResNet18 | arquitectura | 15 | 0.9456 | 0.5315 |
| `exp41_4cls_field_eff_weighted` | baseline field con EfficientNet | arquitectura | 15 | 0.9555 | 0.4981 |
| `exp42_4cls_field_mob_weighted` | baseline field con MobileNet | arquitectura liviana | 15 | 0.9216 | 0.5609 |
| `exp43_4cls_field_res18_quality_aug` | field + quality augmentation | augmentation moderado | 15 | 0.9513 | 0.5069 |
| `exp44_4cls_field_eff_quality_aug` | field + quality augmentation + EfficientNet | línea recomendada actual | 15 | 0.9548 | 0.5035 |
| `exp45_4cls_field_res18_under` | field undersampled con ResNet18 | balanceo | 15 | 0.9569 | 0.5019 |
| `exp46_4cls_field_eff_under` | field undersampled con EfficientNet | balanceo | 15 | 0.9548 | 0.5004 |
| `exp47_4cls_field_broad_others_res18_quality` | field + `others` más amplio | prueba de rechazo/broad others | 15 | 0.9441 | 0.5745 |

### Resultado práctico
Aunque `exp45` y `exp46` se ven competitivos por validation loss/acc, el benchmark externo `mis-hojas` favorece a `exp44` como mejor balance general.

---

## 5. Corridas auxiliares no tratadas como experimentos oficiales

| ID | Qué parece ser | Épocas |
|---|---|---:|
| `manual_run` | corrida manual fuera del catálogo principal | 35 |
| `training` | corrida legacy o de prueba | 21 |

Estas corridas existen en `results/`, pero no están definidas como parte del catálogo oficial de `experiments.py`.

---

## 6. IDs faltantes o reservados

En el estado actual del repo:

- no hay historiales guardados para `exp26`, `exp27`, `exp31`–`exp39`
- `exp27` aparece en `config.py` como `EXPERIMENT_ID` default, pero no hay evidencia de una corrida oficial equivalente en `results/`
- `exp31` aparece configurado en `run_night_experiments.py`, pero no hay `*_history.json` correspondiente

Eso hay que documentarlo así para no inventar resultados que el repo no respalda.

---

## 7. Cómo usar este apéndice correctamente

- Si querés comparar TODA la historia del proyecto, usá este archivo + `experiment_history_summary.csv`
- Si querés decidir qué modelo usar hoy en la app, NO uses solo este apéndice: usá también el análisis de `mis-hojas`
- Si querés lanzar nuevos experimentos, partí desde la familia `field`

## Referencias internas

- `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/EXPERIMENT_METHODOLOGY.md`
- `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/EXPERIMENT_ANALYSIS.md`
