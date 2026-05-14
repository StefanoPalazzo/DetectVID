# EXPERIMENTS.md — Registro de Experimentos

> Este archivo documenta los experimentos de entrenamiento realizados, sus configuraciones y resultados.
> **Actualizarlo después de cada corrida de entrenamiento.**

---

## Formato de cada experimento

```
### EXP-XXX — [Nombre descriptivo]
**Fecha:** YYYY-MM-DD
**Objetivo:** Qué queremos probar
**Config clave:** Diferencias respecto al baseline

**Resultados:**
| Métrica | Valor |
|---------|-------|
| ...     | ...   |

**Observaciones:** Qué aprendimos, qué falló, qué funcionó
**Próximo paso:** Qué experimento se sugiere a continuación
```

---

## Baseline

### EXP-001 — Baseline: EfficientNet-B0 fine-tuning completo

**Fecha:** Pendiente (primer entrenamiento)

**Objetivo:** Establecer la línea de base con la configuración documentada en `ARCHITECTURE.md`.

**Config:**
```
Modelo:          EfficientNet-B0 (pretrained ImageNet)
Fine-tuning:     Completo (todos los parámetros)
Batch size:      32
LR:              1e-4
Optimizer:       AdamW (wd=1e-4)
Loss:            CrossEntropy (label_smoothing=0.1)
Sampler:         WeightedRandomSampler
Augmentation:    HFlip, VFlip, Rotate(20°), ColorJitter, RandomErase
Early stopping:  patience=7
LR scheduler:    ReduceLROnPlateau (patience=3, factor=0.5)
Epochs máx:      30
```

**Resultados:** *(completar tras el primer entrenamiento)*
| Métrica | Train | Val | Test |
|---------|-------|-----|------|
| Loss (mejor época) | — | — | — |
| Accuracy | — | — | — |
| AUC healthy | — | — | — |
| AUC oidio | — | — | — |
| AUC peronospora | — | — | — |
| F1 healthy | — | — | — |
| F1 oidio | — | — | — |
| F1 peronospora | — | — | — |
| Épocas hasta convergencia | — | — | — |
| Tiempo de entrenamiento | — | — | — |

**Observaciones:** *(completar)*

**Próximo paso:** Si accuracy < 85%, probar EXP-002 (LR más bajo).

---

## Experimentos futuros planificados

### EXP-002 — LR reducido a 5e-5

**Objetivo:** Verificar si un LR más conservador mejora el fine-tuning.

**Config diferente:** `LEARNING_RATE = 5e-5`

**Hipótesis:** El backbone podría adaptarse más suavemente, reduciendo catastrophic forgetting.

---

### EXP-003 — Freeze backbone (feature extraction puro)

**Objetivo:** Verificar si congelar el backbone mejora cuando el dataset es suficientemente diferente de ImageNet.

**Config diferente:** `FREEZE_BACKBONE = True`

**Cuándo hacer este experimento:** Si EXP-001 muestra overfitting severo (val_loss sube mientras train_loss baja).

---

### EXP-004 — EfficientNet-B2

**Objetivo:** Verificar si más capacidad del backbone mejora los resultados.

**Config diferente:** `MODEL_NAME = "efficientnet_b2"` (parámetros: ~9.2M, top-1: 80.1%)

**Cuándo hacer este experimento:** Si EXP-001 muestra underfitting (train_loss alto).

---

### EXP-005 — Sin Label Smoothing

**Objetivo:** Determinar si label smoothing ayuda o perjudica en este dominio.

**Config diferente:** `LABEL_SMOOTHING = 0.0`

---

### EXP-006 — Augmentation reducido

**Objetivo:** Verificar si el augmentation agresivo está borrando features relevantes.

**Config diferente:** Solo HFlip + Rotate(10°), sin ColorJitter ni RandomErasing.

---

### EXP-007 — Gradual Unfreezing

**Objetivo:** Descongelar capas progresivamente para reducir catastrophic forgetting.

**Implementación:** 
- Épocas 1-5: solo entrenar el head
- Épocas 6-10: descongelar últimas 2 capas del backbone
- Época 11+: fine-tuning completo con LR aún más bajo

---

## Cómo interpretar los resultados

### Métricas importantes por clase

**Oidio** es la clase más crítica para monitorear:
- Es la clase con menos datos (978 imágenes)
- Un F1 bajo en oidio indica que el modelo no aprendió bien esta clase
- Si F1_oidio < 0.70, considerar augmentation específico para oidio

**Peronospora** vs **Healthy**:
- La confusión entre estas dos clases es la más costosa agronómicamente
- Ver la celda [peronospora, healthy] y [healthy, peronospora] en la matriz de confusión

### Señales de alerta

| Señal | Diagnóstico | Solución |
|-------|-------------|----------|
| train_acc >> val_acc (>15% de diferencia) | Overfitting | Aumentar augmentation, reducir LR, probar freeze backbone |
| val_loss no baja en las primeras 5 épocas | LR muy bajo o muy alto | Probar LR=5e-4 o 5e-5 |
| Accuracy general alta pero F1_oidio bajo | La clase minoritaria no se aprende | Verificar WeightedSampler, aumentar peso de oidio |
| Loss NaN | LR demasiado alto o bug en datos | Verificar imágenes corruptas, reducir LR |

---

## Resultados guardados

Después de cada experimento, los siguientes archivos se guardan en `results/`:

```
results/
├── training_history.json    ← Loss y accuracy por época
├── metrics.json             ← Métricas del test set
├── confusion_matrix.png     ← Matriz de confusión
├── roc_curves.png           ← Curvas ROC por clase
└── training_curves.png      ← Loss y accuracy a lo largo del tiempo
```

**Recomendación:** Renombrar estos archivos por experimento antes de hacer una nueva corrida, para no perder el historial:
```bash
mv results/ results_EXP001/
mkdir results/
```

---

*Para decisiones de arquitectura y justificación de hiperparámetros, ver [ARCHITECTURE.md](./ARCHITECTURE.md)*
