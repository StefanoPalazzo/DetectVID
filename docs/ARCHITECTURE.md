# DetectVID — Arquitectura del Sistema

> Documento personal de referencia. Explica cómo está construido el proyecto,
> por qué cada parte existe, y cómo se conectan entre sí.

---

## Índice

1. [Vista general](#1-vista-general)
2. [Los tres servicios](#2-los-tres-servicios)
3. [Frontend](#3-frontend)
4. [Backend (API Node)](#4-backend-api-node)
5. [ML API (Python)](#5-ml-api-python)
6. [Base de datos](#6-base-de-datos)
7. [Autenticación — flujo completo](#7-autenticación--flujo-completo)
8. [Flujo de análisis — de la foto al resultado](#8-flujo-de-análisis--de-la-foto-al-resultado)
9. [Storage de imágenes](#9-storage-de-imágenes)
10. [Estructura de carpetas](#10-estructura-de-carpetas)

---

## 1. Vista general

DetectVID es una aplicación web para detectar enfermedades en hojas de vid usando
un modelo de deep learning. El sistema tiene **tres servicios independientes** que
se comunican entre sí:

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER                                  │
│                                                                  │
│   React + Vite + Tailwind CSS                                    │
│   http://localhost:5174                                          │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
         Auth / Fincas                    Análisis ML
         Análisis (guardar)               (clasificar imagen)
                │                               │
                ▼                               ▼
┌──────────────────────────┐    ┌───────────────────────────────┐
│   BACKEND Node.js         │    │   ML API Python (FastAPI)     │
│   Express + Prisma        │    │   EfficientNet-B0 (PyTorch)   │
│   http://localhost:3001   │    │   http://localhost:8000       │
└──────────┬───────────────┘    └───────────────────────────────┘
           │
           ▼
┌──────────────────────────┐    ┌───────────────────────────────┐
│   PostgreSQL              │    │   Cloudinary (imágenes)       │
│   detectvid_db            │    │   CDN externo                 │
└──────────────────────────┘    └───────────────────────────────┘
```

**Regla de oro:** cada servicio tiene UNA responsabilidad.
- **Frontend**: mostrar la UI y orquestar las llamadas.
- **Backend Node**: autenticación, usuarios, persistencia en DB.
- **ML API Python**: clasificar imágenes con el modelo entrenado.

---

## 2. Los tres servicios

| Servicio | Tecnología | Puerto | Comando de arranque |
|----------|-----------|--------|---------------------|
| Frontend | React 18 + Vite | 5174 | `cd frontend && npm run dev` |
| Backend | Node.js + Express | 3001 | `cd backend && npm run dev` |
| ML API | Python + FastAPI | 8000 | `cd ml && uvicorn api.main:app --reload --port 8000` |

Los tres tienen que estar corriendo al mismo tiempo para que la app funcione completa.

---

## 3. Frontend

### Tecnologías

| Librería | Para qué se usa |
|----------|----------------|
| React 18 | UI con componentes y estado |
| Vite | Bundler y dev server (reemplaza Create React App) |
| React Router v6 | Navegación SPA (Single Page App) |
| Tailwind CSS | Estilos utility-first |
| Framer Motion | Animaciones fluidas |
| Leaflet + React Leaflet | Mapa interactivo |
| Lucide React | Íconos SVG |
| exifr | Lectura de metadatos GPS de las fotos |
| date-fns | Formateo de fechas |

### Estructura de archivos

```
frontend/src/
├── main.jsx              ← Punto de entrada. Monta <App> en el DOM.
├── App.jsx               ← Router principal. Define todas las rutas.
├── index.css             ← Estilos globales (Tailwind directives)
│
├── pages/                ← Una página = una ruta URL
│   ├── Home.jsx          ← / (landing, no requiere login)
│   ├── Login.jsx         ← /login
│   ├── Register.jsx      ← /register
│   ├── Analyze.jsx       ← /analyze ⭐ flujo principal del MVP
│   ├── History.jsx       ← /history (historial de análisis)
│   ├── Dashboard.jsx     ← /dashboard (placeholder, v2.0)
│   ├── VineyardMap.jsx   ← /map (mapa de fincas)
│   └── Settings.jsx      ← /settings
│
├── components/
│   ├── ProtectedRoute.jsx      ← Guard de autenticación
│   ├── analysis/
│   │   ├── UploadZone.jsx      ← Drag & drop de imagen
│   │   ├── ImagePreview.jsx    ← Preview + metadata de la foto
│   │   ├── AnalysisLoader.jsx  ← Animación de carga (4 pasos)
│   │   └── ResultsCard.jsx     ← Resultado del diagnóstico
│   └── layout/
│       ├── MainLayout.jsx      ← Shell: sidebar + header + contenido
│       ├── Sidebar.jsx         ← Navegación lateral
│       ├── Header.jsx          ← Barra superior + toggle dark/light
│       └── Footer.jsx          ← Pie de página
│
├── context/              ← Estado global (React Context API)
│   ├── AuthContext.jsx   ← Usuario autenticado + acciones de sesión
│   ├── AnalysisContext.jsx ← Estado del flujo de análisis
│   └── ThemeContext.jsx  ← Tema claro/oscuro
│
└── services/             ← Toda la comunicación con APIs externas
    ├── authService.js    ← Llamadas a /api/auth/*
    ├── analysisService.js ← Llamadas a /api/analyses/*
    ├── fincaService.js   ← Llamadas a /api/fincas/*
    └── mlService.js      ← Llamadas a la ML API Python ⭐
```

### Rutas de la aplicación

```
/                 → Home         (pública)
/login            → Login        (pública, redirige si ya hay sesión)
/register         → Register     (pública)
/analyze          → Analyze      (🔒 requiere login)
/history          → History      (🔒 requiere login)
/dashboard        → Dashboard    (🔒 requiere login)
/map              → VineyardMap  (🔒 requiere login)
/settings         → Settings     (🔒 requiere login)
```

Las rutas protegidas están envueltas en `<ProtectedRoute>`. Si el usuario
no está autenticado, lo redirige a `/login` guardando a dónde quería ir
(`location.state`), para volver ahí después del login.

### Cómo funciona el Estado Global (Context API)

En vez de pasar datos entre componentes via props (lo cual se vuelve un infierno
en apps grandes), usamos **Context API** — un "canal" que cualquier componente
puede leer o modificar.

```
App.jsx
└── ThemeProvider        ← provee { theme, toggleTheme }
    └── AuthProvider     ← provee { user, login, logout, loading }
        └── AnalysisProvider ← provee { currentImage, analysisStatus, result, ... }
            └── <Routes> (todas las páginas)
```

Cada Provider tiene:
- Un **estado** (el dato compartido)
- Un **Reducer** (función que define CÓMO cambia el estado)
- Un **Custom Hook** (`useAuth()`, `useAnalysis()`, `useTheme()`) para acceder desde cualquier componente

**¿Por qué Reducer y no useState directo?**
Porque el flujo de análisis tiene muchos estados (idle → analyzing → complete → error)
y el Reducer los hace explícitos y predecibles. Ver `AnalysisContext.jsx`.

### Cómo se comunica el Frontend con las APIs

Todos los `fetch()` están centralizados en la carpeta `services/`. Los componentes
nunca llaman `fetch()` directamente — siempre llaman funciones del servicio.

```javascript
// ❌ Mal — fetch directo en el componente
const res = await fetch('http://localhost:3001/api/auth/login', { ... })

// ✅ Bien — a través del servicio
import { login } from '../services/authService'
const user = await login(email, password)
```

Esto hace que si la URL del backend cambia, solo hay que tocar `services/`,
no buscar fetch() en todos los componentes.

---

## 4. Backend (API Node)

### Tecnologías

| Librería | Para qué se usa |
|----------|----------------|
| Express | Framework HTTP |
| Prisma | ORM — mapea objetos JS a tablas PostgreSQL |
| bcryptjs | Hash de contraseñas (cost 12) |
| jsonwebtoken | Generar y verificar tokens JWT |
| cookie-parser | Leer cookies del request |
| multer | Recibir archivos (imágenes) en multipart/form-data |
| helmet | Headers de seguridad HTTP automáticos |
| cors | Control de qué orígenes pueden llamar a la API |
| express-rate-limit | Limitar intentos de login (anti-brute-force) |
| morgan | Logs de cada request en la terminal |
| cloudinary | SDK para subir imágenes al CDN |

### Estructura de archivos

```
backend/src/
├── server.js                 ← Punto de entrada. Configura Express y monta rutas.
│
├── routes/                   ← Solo definen URLs y middlewares. Sin lógica.
│   ├── authRoutes.js         ← /api/auth/*
│   ├── analysisRoutes.js     ← /api/analyses/*
│   └── fincaRoutes.js        ← /api/fincas/*
│
├── controllers/              ← Lógica de negocio. Leen request, llaman DB, responden.
│   ├── authController.js     ← register, login, logout, me
│   ├── analysisController.js ← create, list, deleteOne, deleteMany
│   └── fincaController.js    ← create, list, update, delete
│
├── middleware/
│   └── authMiddleware.js     ← authenticate() y authorize() — verifica JWT
│
├── lib/
│   └── prisma.js             ← Instancia singleton del cliente Prisma
│
└── storage/
    └── index.js              ← Adapter de storage (local o Cloudinary)
```

### Todas las rutas del backend

#### Auth — `/api/auth`

| Método | Ruta | Auth | Descripción |
|--------|------|:----:|-------------|
| POST | `/api/auth/register` | ❌ | Crea cuenta. Body: `{ name, email, password }` |
| POST | `/api/auth/login` | ❌ | Verifica credenciales. Setea cookie JWT. |
| POST | `/api/auth/logout` | ❌ | Limpia la cookie. |
| GET | `/api/auth/me` | ✅ | Devuelve el usuario de la sesión actual. |

#### Análisis — `/api/analyses`

| Método | Ruta | Auth | Descripción |
|--------|------|:----:|-------------|
| POST | `/api/analyses` | ✅ | Guarda análisis. Sube imagen a Cloudinary. Persiste en DB. |
| GET | `/api/analyses` | ✅ | Lista análisis del usuario con filtros opcionales. |
| DELETE | `/api/analyses` | ✅ | Elimina múltiples análisis. Body: `{ ids: [] }` |
| DELETE | `/api/analyses/:id` | ✅ | Elimina un análisis por ID. |

#### Fincas — `/api/fincas`

| Método | Ruta | Auth | Descripción |
|--------|------|:----:|-------------|
| GET | `/api/fincas` | ✅ | Lista todas las fincas del usuario. |
| POST | `/api/fincas` | ✅ | Crea finca. Body: `{ name, coordinates, color? }` |
| PUT | `/api/fincas/:id` | ✅ | Actualiza nombre/color/coordenadas. |
| DELETE | `/api/fincas/:id` | ✅ | Elimina finca. Verifica ownership. |

#### Otros

| Método | Ruta | Auth | Descripción |
|--------|------|:----:|-------------|
| GET | `/health` | ❌ | Confirma que el servidor está vivo. |

### Cómo está organizado el código (separación de responsabilidades)

```
Request HTTP
     │
     ▼
routes/          ← ¿Qué URL? ¿Qué middlewares corren antes?
     │
     ▼
middleware/      ← ¿Está autenticado? ¿Tiene el rol correcto? ¿El body es válido?
     │
     ▼
controllers/     ← Toda la lógica: leer body, llamar DB, responder JSON
     │
     ├── prisma  ← Base de datos (via ORM)
     └── storage ← Subir/borrar imágenes
```

Cada capa solo sabe de la siguiente. El controller no sabe de rutas. La ruta no sabe de la DB.

---

## 5. ML API Python

### Tecnologías

| Librería | Para qué se usa |
|----------|----------------|
| FastAPI | Framework HTTP async para Python |
| Uvicorn | Servidor ASGI (como nodemon pero para Python) |
| PyTorch | Framework de deep learning |
| torchvision | Modelos pre-entrenados (EfficientNet-B0) |
| Pillow (PIL) | Procesar imágenes antes de pasarlas al modelo |

### El modelo de IA

El modelo es un **EfficientNet-B0** con Transfer Learning:

```
Imagen 224x224 RGB
        │
        ▼
┌──────────────────────────────────────────────┐
│  EfficientNet-B0 (backbone pre-entrenado     │
│  en ImageNet — 1.2M imágenes, 1000 clases)  │
│                                              │
│  Detecta bordes, texturas, formas generales  │
└──────────────────┬───────────────────────────┘
                   │  1280 features
                   ▼
┌──────────────────────────────────────────────┐
│  Classifier Head (entrenado en hojas de vid) │
│                                              │
│  Dropout(0.3)                                │
│  Linear(1280 → 512)                          │
│  ReLU                                        │
│  Dropout(0.2)                                │
│  Linear(512 → 3)  ← 3 clases de salida      │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
        3 logits (uno por clase)
        │
        ▼ Softmax
        ┌─────────────────────┐
        │ healthy:     0.02   │
        │ oidio:       0.95   │  ← clase predicha
        │ peronospora: 0.03   │
        └─────────────────────┘
```

**¿Qué es Transfer Learning?**
EfficientNet ya aprendió a reconocer patrones visuales generales (bordes, texturas,
formas) entrenando con millones de imágenes. Nosotros tomamos ese conocimiento y
solo le enseñamos las últimas capas a distinguir entre hojas sanas y enfermas.
Es como contratar a alguien con experiencia en fotografía y enseñarle solo
el dominio específico de las hojas de vid — mucho más rápido que entrenar desde cero.

### Estructura de archivos

```
ml/
├── api/                          ← API HTTP (FastAPI)
│   ├── main.py                   ← Punto de entrada. Carga el modelo al arrancar.
│   ├── routes/
│   │   └── predict.py            ← Define los endpoints HTTP (URLs)
│   ├── controllers/
│   │   └── predict_controller.py ← Valida request, llama service, arma response
│   ├── services/
│   │   └── model_service.py      ← Carga el modelo. Corre la predicción. ⭐
│   └── schemas/
│       └── prediction.py         ← Contratos de entrada/salida (tipos Pydantic)
│
└── src/                          ← Código de ML (entrenamiento e inferencia)
    ├── config.py                 ← Todos los hiperparámetros y rutas del proyecto
    ├── model.py                  ← Arquitectura del modelo (VidLeafClassifier)
    ├── predict.py                ← Función predict() — preprocesa + infiere
    ├── dataset.py                ← Dataset PyTorch para entrenamiento
    ├── train.py                  ← Loop de entrenamiento
    └── evaluate.py               ← Métricas de evaluación
```

### Por qué esta separación (routes / controllers / services / schemas)

Es el mismo patrón del backend Node, aplicado a Python:

```
POST /api/ml/predict (imagen)
         │
         ▼
routes/predict.py        ← Solo define la URL y el tipo de parámetro
         │
         ▼
controllers/predict_controller.py ← Valida tipo de archivo, maneja errores HTTP
         │
         ▼
services/model_service.py ← Convierte bytes → tensor → pasa por el modelo → dict
         │
         ▼
src/predict.py            ← Lógica pura de ML (sin saber de HTTP)
```

**La clave de escalabilidad:** `model_service.py` es la ÚNICA clase que sabe
que existe PyTorch. Si mañana querés usar ONNX, una API de HuggingFace, o
TensorFlow, solo reemplazás esa clase. El controller, las rutas y el frontend
no se enteran.

```python
# En main.py — para cambiar el modelo, solo cambiás esta línea:
_service = PyTorchModelService()       # hoy
_service = OnnxModelService(...)       # mañana
_service = RemoteModelService(url)     # pasado mañana
```

### Endpoints disponibles

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/ml/predict` | Recibe imagen (JPG/PNG/WEBP), devuelve clasificación |
| GET | `/api/ml/health` | Estado del servicio y si el modelo está cargado |
| GET | `/docs` | Swagger UI generado automáticamente por FastAPI |

---

## 6. Base de datos

**PostgreSQL** gestionado con **Prisma ORM**.

Prisma tiene dos roles:
1. **Migrations**: define la estructura de las tablas en `schema.prisma` y aplica cambios con `prisma db push` o `prisma migrate dev`.
2. **Cliente**: genera código TypeScript/JS tipado para hacer queries sin escribir SQL.

### Modelos (tablas)

```
┌─────────────────────────────────────────────────────────┐
│  users                                                  │
│  ──────                                                 │
│  id           String  (cuid, PK)                       │
│  name         String                                    │
│  email        String  (unique)                          │
│  password_hash String  (bcrypt, nunca se expone)        │
│  role         Enum    (PRODUCTOR | ADMIN)               │
│  created_at   DateTime                                  │
│  updated_at   DateTime                                  │
└────────────────┬───────────────────┬────────────────────┘
                 │ 1:N               │ 1:N
                 ▼                   ▼
┌───────────────────────┐  ┌────────────────────────────────┐
│  analyses             │  │  fincas                        │
│  ────────             │  │  ──────                        │
│  id           String  │  │  id           String           │
│  userId       String  │  │  userId       String           │
│  imageUrl     String  │  │  name         String           │
│  imageProvider String │  │  color        String (#hex)    │
│  disease      String  │  │  coordinates  Json             │
│  diseaseKey   String  │  │  created_at   DateTime         │
│  status       String  │  │  updated_at   DateTime         │
│  confidence   Int     │  └────────────────────────────────┘
│  riskLevel    String  │
│  riskColor    String  │
│  affectedArea String  │
│  urgency      String  │
│  symptoms     String[]│
│  recommendation String│
│  latitude     Float?  │
│  longitude    Float?  │
│  analysisId   String  │
│  processingTime Int?  │
│  modelName    String  │
│  created_at   DateTime│
└───────────────────────┘
```

**Índices creados en `analyses`:**
- `(userId)` — acelera `WHERE userId = ?`
- `(userId, created_at DESC)` — acelera la lista paginada del historial
- `(userId, diseaseKey)` — acelera filtrar por tipo de enfermedad

---

## 7. Autenticación — flujo completo

### Diagrama de secuencia: Login

```
Browser (React)          Backend (Express)         PostgreSQL
      │                         │                       │
      │  POST /api/auth/login   │                       │
      │  { email, password }    │                       │
      │────────────────────────▶│                       │
      │                         │  SELECT user          │
      │                         │  WHERE email = ?      │
      │                         │──────────────────────▶│
      │                         │                       │
      │                         │◀──────────────────────│
      │                         │  { id, password_hash }│
      │                         │                       │
      │                         │  bcrypt.compare(      │
      │                         │    password,          │
      │                         │    password_hash      │
      │                         │  ) → true/false       │
      │                         │                       │
      │                         │  jwt.sign(            │
      │                         │    { id, email, role }│
      │                         │    JWT_SECRET         │
      │                         │  ) → token            │
      │                         │                       │
      │◀────────────────────────│                       │
      │  Set-Cookie:            │                       │
      │  auth_token=<jwt>       │                       │
      │  HttpOnly; Secure       │                       │
      │                         │                       │
      │  { user: { id, name } } │                       │
      │                         │                       │
 AuthContext.setUser(user)
 → navegación a /analyze
```

### ¿Por qué cookie HttpOnly y no localStorage?

| | localStorage | Cookie HttpOnly |
|--|-------------|-----------------|
| Accesible desde JS | ✅ Sí | ❌ No (solo el browser) |
| Vulnerable a XSS | ✅ Sí, un script malicioso puede robarlo | ❌ No, JS no puede leerla |
| Se envía automáticamente | ❌ No, tenés que agregarlo a cada request | ✅ Sí, el browser lo hace solo |

La cookie HttpOnly es más segura porque aunque haya un ataque XSS (un script
malicioso inyectado en la página), no puede leer el token de autenticación.

### Diagrama de secuencia: Request autenticada

```
Browser                  Backend
   │                        │
   │  GET /api/analyses     │
   │  Cookie: auth_token=<jwt> ← el browser lo envía automáticamente
   │───────────────────────▶│
   │                        │
   │                   authMiddleware.authenticate()
   │                        │
   │                   jwt.verify(token, JWT_SECRET)
   │                        │  → { id, email, role }
   │                        │
   │                   req.user = { id, email, role }
   │                        │
   │                   controller.list(req, res)
   │                        │
   │◀───────────────────────│
   │  { analyses: [...] }   │
```

### Restauración de sesión al cargar la app

Cuando el usuario abre el navegador (o refresca la página), React no sabe si
hay una sesión activa. `AuthContext` resuelve esto:

```
App monta
    │
    ▼
AuthContext useEffect (una sola vez)
    │
    ▼
GET /api/auth/me (la cookie se envía automáticamente)
    │
    ├── 200 OK → setUser(user), setLoading(false)
    └── 401    → setUser(null), setLoading(false)
                      │
                      ▼
              ProtectedRoute redirige a /login
```

---

## 8. Flujo de análisis — de la foto al resultado

Este es el flujo más importante del sistema. Involucra los tres servicios.

```
USUARIO                FRONTEND               ML API (Python)      BACKEND (Node)        DB
   │                      │                         │                    │                │
   │  Sube foto           │                         │                    │                │
   │─────────────────────▶│                         │                    │                │
   │                      │                         │                    │                │
   │                 UploadZone valida              │                    │                │
   │                 (tipo + tamaño)               │                    │                │
   │                      │                         │                    │                │
   │                 Lee GPS del EXIF              │                    │                │
   │                 o pide GPS del device         │                    │                │
   │                      │                         │                    │                │
   │  Click "Analizar"    │                         │                    │                │
   │─────────────────────▶│                         │                    │                │
   │                      │                         │                    │                │
   │                 AnalysisContext               │                    │                │
   │                 dispatch START_ANALYSIS        │                    │                │
   │                 → status: 'analyzing'          │                    │                │
   │                      │                         │                    │                │
   │               AnalysisLoader                  │                    │                │
   │               (animación 4 pasos)             │                    │                │
   │                      │                         │                    │                │
   │                      │  POST /api/ml/predict   │                    │                │
   │                      │  FormData: { file }     │                    │                │
   │                      │────────────────────────▶│                    │                │
   │                      │                         │                    │                │
   │                      │                  Valida tipo MIME            │                │
   │                      │                  Lee bytes de la imagen      │                │
   │                      │                         │                    │                │
   │                      │                  Guarda en temp file        │                │
   │                      │                         │                    │                │
   │                      │                  Preprocesa:                │                │
   │                      │                  Resize → 224x224           │                │
   │                      │                  ToTensor                   │                │
   │                      │                  Normalize (ImageNet)       │                │
   │                      │                         │                    │                │
   │                      │                  modelo.forward(tensor)     │                │
   │                      │                  → 3 logits                 │                │
   │                      │                         │                    │                │
   │                      │                  Softmax → probabilidades   │                │
   │                      │                  argmax → clase predicha    │                │
   │                      │                         │                    │                │
   │                      │◀────────────────────────│                    │                │
   │                      │  {                       │                    │                │
   │                      │    predicted_class: "oidio"                  │                │
   │                      │    confidence: 0.95                          │                │
   │                      │    probabilities: {...}                      │                │
   │                      │  }                       │                    │                │
   │                      │                         │                    │                │
   │                 mlService.js mapea             │                    │                │
   │                 al formato de ResultsCard      │                    │                │
   │                      │                         │                    │                │
   │                 AnalysisContext               │                    │                │
   │                 dispatch SET_RESULT            │                    │                │
   │                 → status: 'complete'           │                    │                │
   │                      │                         │                    │                │
   │◀─────────────────────│                         │                    │                │
   │  ResultsCard visible │                         │                    │                │
   │                      │                         │                    │                │
   │                      │  (en paralelo, no bloquea la UI)             │                │
   │                      │  POST /api/analyses                          │                │
   │                      │  FormData: { image, result, lat, lng }       │                │
   │                      │─────────────────────────────────────────────▶│                │
   │                      │                         │           Sube imagen a Cloudinary  │
   │                      │                         │                    │────────────────▶
   │                      │                         │                    │◀────────────────
   │                      │                         │                    │  imageUrl       │
   │                      │                         │                    │                │
   │                      │                         │           prisma.analysis.create()  │
   │                      │                         │                    │───────────────▶│
   │                      │                         │                    │◀───────────────│
   │                      │◀─────────────────────────────────────────────│                │
   │                      │  { success: true }       │                    │                │
```

### Punto clave: el resultado se muestra ANTES de guardar

El guardado en la DB es **no bloqueante** — se dispara en paralelo con `saveAnalysis().catch(...)`.
Si Cloudinary falla o la DB tiene un error, el usuario igual ve su resultado.
El error solo se loggea en consola como advertencia.

---

## 9. Storage de imágenes

El sistema usa un **patrón Adapter** para el storage:

```
analysisController.js
        │
        │  storage.upload(buffer, options)
        ▼
storage/index.js   ← Lee STORAGE_PROVIDER del .env
        │
        ├── 'local'      → guarda en backend/uploads/
        └── 'cloudinary' → sube a Cloudinary CDN
```

**¿Por qué este patrón?**
Para desarrollo local no necesitás credenciales de Cloudinary. En producción
cambiás `STORAGE_PROVIDER=cloudinary` en el `.env` y nada más cambia.

**Cloudinary en producción:**
- Las imágenes se suben a `detectvid/users/{userId}/`
- Cada imagen tiene un `publicId` único basado en `analysisId + timestamp`
- Al eliminar un análisis, también se elimina la imagen del CDN

---

## 10. Estructura de carpetas

Vista completa del proyecto:

```
DetectVID/                     ← Raíz del monorepo
│
├── frontend/                  ← App React (Vite)
│   ├── src/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── .env                   ← VITE_API_URL, VITE_ML_API_URL
│
├── backend/                   ← API Node.js (Express + Prisma)
│   ├── src/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── uploads/               ← Imágenes en modo local (dev)
│   ├── package.json
│   └── .env                   ← DATABASE_URL, JWT_SECRET, CLOUDINARY_*, etc.
│
├── ml/                        ← Modelo ML + API Python (FastAPI)
│   ├── api/                   ← FastAPI
│   ├── src/                   ← Código de entrenamiento e inferencia
│   ├── checkpoints/
│   │   └── best_model.pth     ← Modelo entrenado (EfficientNet-B0, época 14)
│   ├── data/                  ← Cache de datos procesados
│   ├── results/               ← Métricas de entrenamiento
│   ├── .venv/                 ← Entorno virtual Python 3.10
│   └── requirements.txt
│
└── docs/
    └── ARCHITECTURE.md        ← Este archivo
```

### Variables de entorno

**`frontend/.env`**
```env
VITE_API_URL="http://localhost:3001/api"
VITE_ML_API_URL="http://localhost:8000/api/ml"
```

**`backend/.env`**
```env
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV="development"
FRONTEND_URL="http://localhost:5174"
STORAGE_PROVIDER="cloudinary"          # o "local"
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

---

*Última actualización: Mayo 2026*
