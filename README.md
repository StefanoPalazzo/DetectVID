# DetectVID — detección inteligente de enfermedades en vid

DetectVID es una plataforma AgriTech para monitorear viñedos mediante análisis de imágenes de hojas de vid. Permite subir/capturar una foto, ejecutar inferencia con un modelo de visión computacional, guardar el diagnóstico, revisar historial, ver métricas y ubicar análisis/fincas en un mapa.

Proyecto de tesis — Universidad de Mendoza — Stefano Palazzo.

## Estado del MVP

El MVP actual incluye:

- Autenticación con JWT en cookie HttpOnly.
- Frontend web React/Vite protegido por sesión.
- Backend Express + Prisma + PostgreSQL.
- API ML FastAPI/PyTorch reemplazable por otro motor de inferencia.
- Subida de imágenes con validación y storage local persistente o Cloudinary.
- Historial con miniaturas, filtros, agrupación por día/semana/mes y borrado.
- Dashboard con métricas calculadas desde análisis reales.
- Mapa Leaflet con fincas/polígonos y puntos GPS de análisis.
- App mobile Kotlin Multiplatform con flujo offline-first y sincronización.
- Docker Compose para VM/local.

## Stack

| Capa | Tecnología |
|---|---|
| Web | React 18, Vite 5, Tailwind CSS, React Router, Framer Motion, Leaflet |
| Backend | Node.js 20, Express, Prisma, PostgreSQL, JWT, bcrypt, multer |
| ML API | Python 3.10, FastAPI, PyTorch, torchvision, Pillow |
| Mobile | Kotlin Multiplatform, Compose Multiplatform, Android/iOS shell |
| Deploy | Docker Compose, Nginx reverse proxy |

## Estructura

```text
DetectVID/
├── frontend/          # SPA web React + Nginx config
├── backend/           # API Express, auth, análisis, fincas, Prisma
├── ml/                # Entrenamiento, evaluación y API FastAPI de inferencia
├── mobile/            # App KMP Android/iOS offline-first
├── docs/              # Arquitectura y despliegue
├── docker-compose.yml # Stack local/VM
└── .env.example       # Variables para Docker/VM
```

## Variables de entorno

Para Docker/VM:

```bash
cp .env.example .env
```

Variables principales:

| Variable | Uso |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Base PostgreSQL |
| `JWT_SECRET` | Firma JWT; usar un valor largo y aleatorio |
| `COOKIE_SECURE` | `false` solo para HTTP local; usar `true` con HTTPS |
| `PUBLIC_BASE_URL` | URL pública usada para imágenes locales, ej. `https://detectvid.example.com` |
| `FRONTEND_URLS` | Orígenes CORS permitidos separados por coma |
| `STORAGE_PROVIDER` | `local` para VM, `cloudinary` opcional |

Para desarrollo backend puro:

```bash
cp backend/.env.example backend/.env
```

## Ejecutar con Docker

```bash
docker compose up -d --build
```

Compose exige `POSTGRES_PASSWORD` y `JWT_SECRET`; no incluye credenciales
predeterminadas. Para desarrollo local, copia `.env.example` a `.env` y completa
esos valores antes de iniciar los servicios.

Servicios:

- Frontend/Nginx: http://localhost
- Backend health: http://localhost/api/auth/me requiere sesión; health directo dentro de red: `backend:3001/health`
- ML health vía proxy: http://localhost/api/ml/health
- PostgreSQL: contenedor interno `db`

Ver logs:

```bash
docker compose logs -f
```

Detener:

```bash
docker compose down
```

## Ejecutar en desarrollo local

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Backend: http://localhost:3001

### ML API

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

ML health: http://localhost:8000/api/ml/health

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

## Flujo de análisis

1. El usuario selecciona una imagen JPG/PNG/WEBP.
2. La web valida tipo/tamaño y muestra preview.
3. Se intenta extraer GPS EXIF o ubicación del dispositivo.
4. `frontend/src/services/mlService.js` manda la imagen a `/api/ml/predict`.
5. La ML API devuelve clase, confianza, margen e incertidumbre.
6. El frontend muestra resultado, riesgo y recomendación.
7. `frontend/src/services/analysisService.js` guarda imagen + resultado en `/api/analyses`.
8. Historial, dashboard y mapa consumen esos análisis guardados.

## Conectar o reemplazar modelo real

La frontera estable está en:

- Web: `frontend/src/services/mlService.js`
- ML API: `ml/api/services/model_service.py`
- Contrato respuesta: `ml/api/schemas/prediction.py`

Mientras el endpoint devuelva `predicted_class`, `confidence`, `probabilities`, `is_uncertain` y `top1_margin`, el frontend no necesita cambios.

## Mobile

Abrir `mobile/` en Android Studio para Android. Para iOS, abrir:

```text
mobile/iosApp/DetectVID.xcodeproj
```

La app mobile guarda imágenes en sandbox local, mantiene cola offline y sincroniza con:

- `POST /api/ml/predict`
- `POST /api/analyses`
- `GET /api/analyses?limit=100`

Más detalles en `mobile/README.md`.

## Checks útiles

```bash
npm --prefix frontend run build
npm --prefix backend run db:generate
python3 -m py_compile ml/src/*.py ml/api/services/*.py ml/api/*.py
cd mobile && ./gradlew --no-daemon :composeApp:assembleDebug :composeApp:compileKotlinIosSimulatorArm64
```

## Despliegue en VM

Ver `docs/DEPLOYMENT_VM.md`.

## Documentación adicional

- `docs/ARCHITECTURE.md` — arquitectura general.
- `docs/DEPLOYMENT_VM.md` — guía paso a paso para VM.
- `docs/IMPLEMENTATION_REPORT.md` — cambios recientes y validación.
- `ml/docs/EXPERIMENTS.md` — guía de experimentos ML.
