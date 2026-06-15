# DetectVID — documentación de experimentos

Esta carpeta ahora tiene la documentación de experimentos separada por propósito para que sea fácil de leer, revisar y actualizar.

## Lectura rápida

Si estás empezando desde cero, leé este orden:

1. `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/START_HERE_ML_CV.md`
2. `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/ML_CV_INTENSIVE_COURSE.md`
3. `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/MODEL_SELECTION_AND_CURVES_GUIDE.md`
4. `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/EXPERIMENT_METHODOLOGY.md`
5. `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/EXPERIMENT_ANALYSIS.md`
6. `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/EXPERIMENT_APPENDIX.md`
7. `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/DATASETS_AND_DUPLICATES_EXPLAINED.md`
8. `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/REPRODUCIBLE_EXPERIMENTS_REPORT.md`

Si ya entendés ML y solo querés revisar experimentos, arrancá en `EXPERIMENT_ANALYSIS.md`.

## Qué contiene cada archivo

| Archivo | Para qué sirve |
|---|---|
| `EXPERIMENT_METHODOLOGY.md` | Explica cómo se entrenan y evalúan los modelos: épocas, métricas, augmentation, splits, balanceo y criterio de selección del mejor checkpoint. |
| `EXPERIMENT_ANALYSIS.md` | Resume resultados, gráficos, tendencias y conclusiones prácticas. Incluye análisis especial de los experimentos de campo y de `mis-hojas`. |
| `EXPERIMENT_APPENDIX.md` | Catálogo completo de experimentos con qué hace cada uno, diferencias entre ellos, métricas principales y notas importantes. |

## Artefactos generados para respaldar la documentación

| Archivo | Descripción |
|---|---|
| `../results/experiment_history_summary.csv` | Resumen tabular generado automáticamente desde todos los `*_history.json` encontrados. |
| `./assets/all_experiments_best_val_acc.png` | Comparación de mejor accuracy de validación por experimento. |
| `./assets/all_experiments_best_val_loss.png` | Comparación de mejor validation loss por experimento. |
| `./assets/experiment_family_trends.png` | Tendencias promedio por familia de experimentos. |
| `./assets/field_mishojas_metrics.png` | Comparación de métricas de los experimentos de campo sobre `mis-hojas`. |
| `./assets/field_uncertainty_tradeoff.png` | Relación entre incertidumbre y accuracy aceptado en los experimentos de campo. |

## Conclusión corta

Hoy, para el caso de uso real de campo, la línea más prometedora es:

- **4 clases** (`healthy`, `oidio`, `peronospora`, `others`)
- **close-up / field curated**
- **EfficientNet-B0**
- **quality augmentation moderado**
- **regla de `uncertain` en inferencia**

El experimento que mejor representa eso es:

- `exp44_4cls_field_eff_quality_aug`

Para los detalles y el porqué, ver:

- `/Users/stefanopalazzo/Projects/DetectVID/ml/docs/EXPERIMENT_ANALYSIS.md`
