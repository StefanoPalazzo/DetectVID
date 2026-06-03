# DetectVID: Memoria Técnica y Decisiones de Arquitectura

Este documento registra las motivaciones, decisiones arquitectónicas y metodologías de entrenamiento implementadas durante el desarrollo de **DetectVID**, una aplicación orientada a la detección temprana de enfermedades en hojas de vid mediante Inteligencia Artificial.

---

## 1. Motivación y Origen del Proyecto

El desarrollo de DetectVID nace a partir de una necesidad real detectada en la industria vitivinícola. El trabajo tradicional de monitoreo fitosanitario —realizado por ingenieros agrónomos— consiste en recorrer presencialmente las zonas más sensibles o propensas a enfermedades dentro de grandes extensiones de viñedos. 

Esta revisión manual suele ser ineficiente y, ante la duda o la detección tardía, deriva en la aplicación de **curas preventivas a gran escala**. Esto trae dos consecuencias negativas gravísimas:
1. **Impacto Ambiental:** Saturación innecesaria del ecosistema con agroquímicos y pesticidas.
2. **Impacto Económico:** Incremento drástico en los costos operativos de la empresa vitivinícola.

**DetectVID** se conceptualiza como una aplicación que democratiza el acceso a herramientas de detección temprana, permitiendo a pequeños, medianos y grandes productores generar reportes geolocalizados de zonas con posibles infecciones, para luego aplicar tratamientos focalizados y precisos.

---

## 2. Definición del Alcance y Clases Objetivo

La primera decisión metodológica fue acotar el problema a las patologías más críticas y comunes de la vid. Tras una etapa de investigación, se seleccionaron las siguientes enfermedades principales:
- **Peronospora** (*Plasmopara viticola*, comúnmente Downy Mildew).
- **Oídio** (*Erysiphe necator*, comúnmente Powdery Mildew).

Para enriquecer el modelo y evitar diagnósticos falsos positivos ante patologías no contempladas, se estableció una clase agrupadora denominada **"Otras enfermedades"** (Others), que incluye imágenes de patologías secundarias como *Black Rot*, *Grey Mould*, *ESCA*, y deficiencias nutricionales. Finalmente, se estableció la clase fundamental **"Sana"** (Healthy).

---

## 3. Decisiones de Arquitectura del Sistema

### Computación en la Nube vs. Computación Local (Edge)
Se decidió implementar el núcleo de la inferencia de Inteligencia Artificial **en la nube (Cloud/Backend como Servicio)** en lugar de correr los modelos localmente en los teléfonos de los usuarios. Las razones técnicas son:
1. **Limitaciones de Hardware:** No todos los productores poseen dispositivos móviles con Unidades de Procesamiento Neuronal (NPU) o GPUs potentes capaces de cargar y ejecutar modelos de visión profunda con rapidez.
2. **Conectividad Rural (Estrategia Offline-First):** Las fincas suelen carecer de cobertura de internet continua. Por lo tanto, el flujo de trabajo de la aplicación es *Offline-First*: 
   - El productor toma las fotografías a campo.
   - La aplicación las guarda localmente anexando las coordenadas GPS y metadatos.
   - Al detectar conexión a internet (Wi-Fi en las instalaciones de la bodega), la app sincroniza y carga las imágenes en lote al servidor para que el modelo genere los reportes.

---

## 4. Obtención de Datos y Estrategia de Aumento (Data Augmentation)

Se obtuvieron conjuntos de datos (datasets) provenientes de diversas fuentes académicas y confiables. Dado que los modelos de Deep Learning sufren cuando se los despliega en el mundo real debido a variaciones de cámara, clima, y oclusiones (Domain Shift), se implementó una estrategia robusta de **Data Augmentation** durante el entrenamiento.

Los métodos aplicados en tiempo real incluyeron:
- **Rotaciones y Volteos Aleatorios (Random Horizontal/Vertical Flips):** Para volver al modelo invariante a la orientación de la hoja o de la cámara.
- **Variaciones de Color e Iluminación (ColorJitter):** Alteraciones dinámicas en el brillo, contraste y saturación para simular días nublados, sol directo intenso o sombras profundas.
- **Recortes Aleatorios (Random Resized Crops):** Simula diferentes distancias de encuadre y recorta partes de la hoja (p. ej. cuando la mano del usuario u otra rama tapa la hoja de interés).

---

## 5. Metodología de Entrenamiento: Los 24 Experimentos

La experimentación técnica fue profunda y metódica, constando de un total de **24 experimentos** diseñados para cruzar y evaluar cuatro variables fundamentales:

### A. Arquitecturas de Transfer Learning
Se evaluaron cuatro arquitecturas de redes neuronales pre-entrenadas en ImageNet:
1. **EfficientNet-B0:** Eficiencia óptima de parámetros.
2. **ResNet18:** Equilibrio clásico entre velocidad y profundidad.
3. **ResNet50:** Alta capacidad representacional para datasets complejos.
4. **MobileNet-V3 Small:** Optimización para inferencia súper ligera.

### B. Dimensión de Salida (3 Clases vs. 4 Clases)
- **Modelos de 3 Clases:** Entrenados exclusivamente para distinguir entre [Sana, Oídio, Peronospora].
- **Modelos de 4 Clases:** Entrenados con la categoría agrupada [Sana, Oídio, Peronospora, Otras].

### C. Estrategias de Manejo de Desbalance (Imbalanced Data)
Los datasets originales presentaban un desbalance severo (muchas más hojas sanas que enfermas). Se probaron dos acercamientos:
1. **Undersampling (Submuestreo):** Recortar masivamente la cantidad de imágenes de la clase mayoritaria (Sanas) hasta igualar numéricamente a las clases minoritarias. Esto asegura un balance puro pero a costo de descartar información valiosa.
2. **Weighted Loss (Pérdida Ponderada):** Mantener el 100% de los datos, pero penalizar matemáticamente más fuerte a la red neuronal cuando se equivoca en una clase con pocas imágenes (las enfermedades raras) que cuando se equivoca en una clase abundante.

### D. Fases de Calidad de Datos (El Efecto del Atajo Visual)
Los 24 experimentos se dividieron en dos grandes fases de 12 experimentos cada una:
1. **Fase 1 (Datos Crudos):** Se incluyó un dataset académico que contenía imágenes tomadas en entornos de laboratorio (fondos blancos planos, hojas sobre mesas lisas e iluminación perfecta). Esto provocó *Shortcut Learning*: el modelo aprendió a identificar el "fondo de laboratorio" en lugar de los fenotipos patológicos reales.
2. **Fase 2 ("Clean" / Purga de Datos):** Se eliminaron drásticamente todas las imágenes con fondos planos o artificiales. Los 12 experimentos finales se entrenaron exclusivamente con fotos "salvajes" de campo, simulando el ruido visual (tierra, sol, ramas cruzadas) idéntico a las condiciones en las que el usuario final sacará las fotografías en la finca.
