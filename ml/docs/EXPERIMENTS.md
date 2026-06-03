# EXPERIMENTS.md — Guía de Experimentos DetectVID

> **Para:** Stefano Palazzo — Tesis de grado, DetectVID
> **Objetivo:** Encontrar la arquitectura y estrategia de balanceo que mejor detecte oidio y peronospora en viñedos.
> **Última actualización:** Mayo 2026

---

## Las clases del proyecto

| Clase | Descripción | Imágenes aprox. |
|---|---|---|
| `healthy` | Hoja sana | ~2.600 |
| `oidio` | *Erysiphe necator* — polvo blanco en hoja | ~630 |
| `peronospora` | *Plasmopara viticola* — manchas amarillas | ~1.260 |
| `others` | Black Rot, Grey Mould, ESCA, etc. | ~4.650 |

> Todos los experimentos usan el dataset completo (originales + zenodo mezclados).

---

## El problema de desbalance — por qué importa

El dataset no está equilibrado: `others` y `healthy` tienen 4–7 veces más imágenes que `oidio`. Si no hacés nada, el modelo aprende que "apostar siempre a others" le da buen accuracy sin esfuerzo, y nunca aprende bien las enfermedades que importan.

Hay dos estrategias para corregirlo:

**Weighted loss** — entrenás con TODAS las imágenes, pero le decís al modelo que los errores en clases chicas pesan más. El modelo sigue viendo todas las imágenes pero aprende a prestarle más atención a oidio y peronospora.

**Undersampling** — recortás las clases grandes (healthy, others) para que todas tengan el mismo tamaño que la más chica. Tirás imágenes, pero el training es más limpio y sin sesgos por volumen.

---

## Árbol de experimentos

```
¿Cuántas clases?
│
├── 3 clases (healthy / oidio / peronospora)
│   │
│   ├── Weighted loss
│   │   ├── exp01 — EfficientNet-B0   ← BASELINE
│   │   ├── exp02 — ResNet18
│   │   ├── exp07 — MobileNet-V3
│   │   └── exp09 — ResNet50
│   │
│   └── Undersampling
│       └── exp05 — EfficientNet-B0
│
└── 4 clases (+ others)
    │
    ├── Weighted loss
    │   ├── exp03 — EfficientNet-B0
    │   ├── exp04 — ResNet18
    │   ├── exp08 — MobileNet-V3
    │   └── exp10 — ResNet50
    │
    └── Undersampling
        ├── exp06 — EfficientNet-B0
        └── exp11 — ResNet18
```

**exp12** — re-run del ganador con más epochs para confirmar que escala.

---

## Tabla de experimentos

| ID | Modelo | Clases | Balanceo | Pregunta que responde |
|---|---|---|---|---|
| exp01 | EfficientNet-B0 | 3 | Weighted | **BASELINE** — punto de referencia |
| exp02 | ResNet18 | 3 | Weighted | ¿ResNet18 supera a EfficientNet? |
| exp07 | MobileNet-V3 | 3 | Weighted | ¿MobileNet es viable en campo (modelo liviano)? |
| exp09 | ResNet50 | 3 | Weighted | ¿Una red más grande ayuda con 3 clases? |
| exp05 | EfficientNet-B0 | 3 | Undersampling | ¿Undersampling supera a weighted en 3 clases? |
| exp03 | EfficientNet-B0 | 4 | Weighted | ¿Agregar "others" mejora la precisión en campo? |
| exp04 | ResNet18 | 4 | Weighted | ¿ResNet18 + others? |
| exp08 | MobileNet-V3 | 4 | Weighted | ¿MobileNet + others? |
| exp10 | ResNet50 | 4 | Weighted | ¿ResNet50 + others? |
| exp06 | EfficientNet-B0 | 4 | Undersampling | ¿Undersampling supera a weighted en 4 clases? |
| exp11 | ResNet18 | 4 | Undersampling | ¿ResNet18 undersampled mejora? |
| exp12 | (ganador) | (ganador) | (ganador) | ¿El ganador escala con más epochs? |

### Fase 2: Modelos Clean (sin sesgos de laboratorio)
Mismos experimentos de la Fase 1, pero entrenados sobre un dataset depurado que excluye las imágenes con fondos planos o lisos, evitando el *shortcut learning*.
| ID | Modelo | Clases | Balanceo | Equivalente original |
|---|---|---|---|---|
| exp13_clean | EfficientNet-B0 | 3 | Weighted | exp01 |
| exp14_clean | ResNet18 | 3 | Weighted | exp02 |
| exp15_clean | MobileNet-V3 | 3 | Weighted | exp07 |
| exp16_clean | ResNet50 | 3 | Weighted | exp09 |
| exp17_clean | EfficientNet-B0 | 3 | Undersampling | exp05 |
| exp18_clean | EfficientNet-B0 | 4 | Weighted | exp03 |
| exp19_clean | ResNet18 | 4 | Weighted | exp04 |
| exp20_clean | MobileNet-V3 | 4 | Weighted | exp08 |
| exp21_clean | ResNet50 | 4 | Weighted | exp10 |
| exp22_clean | EfficientNet-B0 | 4 | Undersampling | exp06 |
| exp23_clean | ResNet18 | 4 | Undersampling | exp11 |
| exp24_clean | (ganador) | 4 | Weighted | exp12 |

---

## Los tres ejes de comparación para la tesis

### Eje 1 — Arquitectura (exp01 vs exp02 vs exp07 vs exp09)
Todos con 3 clases, weighted loss, mismos datos. Diferencia: solo el modelo.

| Modelo | Parámetros | Velocidad inferencia | Ideal para |
|---|---|---|---|
| EfficientNet-B0 | ~5.3M | Rápido | Datasets chicos, móvil |
| ResNet18 | ~11.7M | Rápido | Baseline clásico |
| MobileNet-V3 | ~5.5M | Muy rápido | Deployment en dispositivo |
| ResNet50 | ~25.6M | Más lento | Más capacidad, más datos |

**Hipótesis**: EfficientNet-B0 debería ganar o empatar — fue diseñado específicamente para datasets pequeños.

### Eje 2 — Granularidad de clases (3 cls vs 4 cls)
Mismo modelo (EfficientNet-B0), mismo balanceo (weighted). Diferencia: se agrega `others`.

**¿Por qué importa `others`?** En campo, el viticultor va a sacarle fotos a hojas que tienen Black Rot, ESCA o Grey Mould — enfermedades que no son oidio ni peronospora. Sin la clase `others`, el modelo las va a clasificar como una de las tres clases que sí conoce, generando falsos positivos. Con `others`, aprende a decir "esto es otra cosa".

**Riesgo**: agregar una clase dilata el espacio de decisión. Si `others` tiene mucho ruido o muchas imágenes, puede degradar la precisión en las clases que importan.

### Eje 3 — Estrategia de balanceo (weighted vs undersampling)
Mismo modelo, mismas clases. Diferencia: cómo se maneja el desbalance.

**Weighted loss** es más conservador — no tirás datos, el modelo aprende de todo.
**Undersampling** es más agresivo — el training es limpio pero el modelo ve menos ejemplos de healthy y others.

En datasets chicos como este, tirar datos suele doler. La hipótesis es que weighted debería ganar, pero exp05 y exp06 lo confirman o refutan.

---

## Métricas clave

No te quedes solo con el accuracy. Lo que importa para la tesis:

| Métrica | Por qué importa |
|---|---|
| **F1-macro** | Promedia todas las clases por igual — penaliza si alguna clase queda mal |
| **F1 por clase** | Ves exactamente qué clase falla |
| **Recall de oidio/peronospora** | En campo, los falsos negativos son el peor error — no detectar una enfermedad |
| **Confusion matrix** | Muestra los patrones de confusión entre clases |

> **Regla de oro**: un modelo con 85% accuracy pero recall 0.40 en oidio es peor que uno con 80% accuracy y recall 0.75 en oidio.

---

## Cómo correr los experimentos

```bash
# Instalar dependencias (primera vez)
pip install -r requirements.txt
wandb login   # te pide el API key de wandb.ai/authorize

# Ver todos los experimentos
python src/experiments.py --list

# Correr todos (tarda varias horas)
python src/experiments.py

# Correr uno solo
python src/experiments.py --experiment exp01_3cls_weighted_eff

# Dry-run: ver qué correría sin ejecutar nada
python src/experiments.py --dry-run

# Sin W&B (debug local)
python src/experiments.py --no-wandb
```

---

## Tiempo estimado

| Entorno | Tiempo por experimento | Total (12 exp) |
|---|---|---|
| MacBook Pro M4 Pro | ~15–25 min | ~4–5 horas |
| Google Colab (T4) | ~8–15 min | ~2–3 horas |
| Google Colab (A100) | ~4–8 min | ~1–1.5 horas |

> En Colab, corré de a grupos de 4–5 experimentos para evitar que la sesión expire.

---

## Interpretar resultados en W&B

Una vez que corriste los experimentos, en W&B podés:

1. **Parallel coordinates plot** — cada línea es un experimento, cada eje es una métrica. Inmediatamente ves qué combinación domina.
2. **Group by** `num_classes` → comparás 3cls vs 4cls directamente.
3. **Group by** `model_name` → comparás arquitecturas.
4. **Sort by** `val_f1_oidio` → el F1 de oidio es tu métrica principal.

---

## Preguntas frecuentes

**¿Por qué no comparar con/sin zenodo?**
El zenodo es simplemente más datos — no es un dataset especial. Agregar más datos siempre ayuda o es neutro. No es una hipótesis interesante para la tesis. Lo que sí importa es qué arquitectura y estrategia de balanceo aprovechan mejor esos datos.

**¿Por qué exp12 usa el ganador?**
Los experimentos exp01–exp11 usan los mismos hiperparámetros (epochs, lr, batch_size). El exp12 le da al ganador más epochs para confirmar que el resultado no es un artefacto del early stopping y que la configuración es genuinamente mejor.

**¿Qué hago si un experimento falla?**
El runner captura la excepción y continúa con el siguiente. Podés re-correr el fallido individualmente con `--experiment <id>`.
