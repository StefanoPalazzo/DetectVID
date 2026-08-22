# DetectVID — intelligent grapevine disease detection

**English** | [Español](README.es.md)

DetectVID is an AgriTech platform for monitoring vineyards through image analysis of grapevine leaves. Users can upload or capture a photo, run computer-vision inference, save the diagnosis, review historical results and metrics, and locate analyses and vineyards on a map.

Computer Engineering capstone project — University of Mendoza — Stefano Palazzo.

## Architecture

![DetectVID system architecture](docs/assets/detectvid-architecture.png)

## MVP status

The current MVP includes:

- JWT authentication stored in an HttpOnly cookie.
- Session-protected React/Vite web application.
- Express backend with Prisma and PostgreSQL.
- Replaceable FastAPI/PyTorch ML inference service.
- Image uploads with MIME/type and size filtering, plus persistent local storage or Cloudinary.
- Analysis history with thumbnails, filters, time-based grouping, and deletion.
- Dashboard metrics calculated from stored analyses.
- Leaflet map with vineyard polygons and geolocated analysis points.
- Kotlin Multiplatform mobile app with a persistent offline queue and foreground synchronization.
- Docker Compose deployment for a VM or local environment.

## Technology stack

| Layer | Technology |
|---|---|
| Web | React 18, Vite 5, Tailwind CSS, React Router, Framer Motion, Leaflet |
| Backend | Node.js 20, Express, Prisma, PostgreSQL, JWT, bcrypt, multer |
| ML API | Python 3.10, FastAPI, PyTorch, torchvision, Pillow |
| Mobile | Kotlin Multiplatform, Compose Multiplatform, Android/iOS shells |
| Deployment | Docker Compose, Nginx reverse proxy |

## Repository structure

```text
DetectVID/
├── frontend/          # React SPA and Nginx configuration
├── backend/           # Express API, authentication, analyses, vineyards, Prisma
├── ml/                # Training, evaluation, and FastAPI inference service
├── mobile/            # Offline-first KMP app for Android and iOS
├── docs/              # Architecture and deployment documentation
├── docker-compose.yml # Local/VM stack
└── .env.example       # Docker/VM environment template
```

## Environment variables

For Docker or VM deployment:

```bash
cp .env.example .env
```

Main variables:

| Variable | Purpose |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | PostgreSQL configuration |
| `JWT_SECRET` | JWT signing key; use a long, random value |
| `COOKIE_SECURE` | Use `false` only for local HTTP and `true` with HTTPS |
| `PUBLIC_BASE_URL` | Public URL used for locally stored images, e.g. `https://detectvid.example.com` |
| `FRONTEND_URLS` | Comma-separated CORS origins |
| `STORAGE_PROVIDER` | `local` for the VM or optional `cloudinary` storage |
| `MODEL_EXPERIMENT_ID` | Deployment model ID; defaults to `exp44_4cls_field_eff_quality_aug` |

For standalone backend development:

```bash
cp backend/.env.example backend/.env
```

## Run with Docker

```bash
docker compose up -d --build
```

Compose requires `POSTGRES_PASSWORD` and `JWT_SECRET`; it does not provide default credentials. For local development, copy `.env.example` to `.env` and set both values before starting the services.

Services:

- Frontend/Nginx: http://localhost
- Backend health: http://localhost/api/auth/me requires a session; internal health endpoint: `backend:3001/health`
- ML health through Nginx: http://localhost/api/ml/health
- PostgreSQL: internal `db` container

Follow logs:

```bash
docker compose logs -f
```

Stop the stack:

```bash
docker compose down
```

## Run locally without Docker

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
# Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in backend/.env before seeding.
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

## Analysis flow

1. The user selects a JPG, PNG, or WEBP image.
2. The web application filters by declared MIME/type and size, then displays a preview; it does not perform content-level image validation.
3. The application attempts to obtain EXIF GPS data or the device location.
4. `frontend/src/services/mlService.js` sends the image to `/api/ml/predict`.
5. The ML API returns the predicted class, confidence, top-class margin, and uncertainty status.
6. The frontend presents the diagnosis, risk level, and recommendation.
7. `frontend/src/services/analysisService.js` stores the image and result through `/api/analyses`.
8. The history, dashboard, and map consume the persisted analyses.

## Integrating or replacing the model

The stable integration boundary consists of:

- Web client: `frontend/src/services/mlService.js`
- ML service: `ml/api/services/model_service.py`
- Response contract: `ml/api/schemas/prediction.py`

As long as the inference endpoint returns `predicted_class`, `confidence`, `probabilities`, `is_uncertain`, and `top1_margin`, the frontend does not need to change.

### Model artifacts and experimental records

Checkpoint binaries, datasets, manifests, and experiment-result artifacts are intentionally not stored in Git. Inference requires an externally supplied `.pth` checkpoint in `ml/checkpoints` that matches `MODEL_EXPERIMENT_ID`; no stable public download is currently provided. Reported metrics are local experimental records, not publicly reproducible benchmarks.

## Mobile

Open `mobile/` in Android Studio for Android development. For iOS, open:

```text
mobile/iosApp/DetectVID.xcodeproj
```

The mobile application stores images in its local sandbox, maintains a persistent offline queue, and synchronizes while it is in the foreground with:

- `POST /api/ml/predict`
- `POST /api/analyses`
- `GET /api/analyses?limit=100`

See `mobile/README.md` for additional details. Background/offline synchronization is not guaranteed.

## Known limitations

- The inference checkpoint is untracked and must be supplied externally.
- Field and generalization validation are still pending.
- Uncertainty thresholds are heuristic and uncalibrated.
- Mobile synchronization runs in the foreground; no background/offline delivery guarantee is provided.
- Direct ML API boundary, rate limiting, and authentication hardening are out of scope for this MVP.

## Useful checks

```bash
npm --prefix frontend run build
npm --prefix backend run db:generate
python3 -m py_compile ml/src/*.py ml/api/services/*.py ml/api/*.py
cd mobile && ./gradlew --no-daemon :composeApp:assembleDebug :composeApp:compileKotlinIosSimulatorArm64
```

## VM deployment

See `docs/DEPLOYMENT_VM.md`.

## Additional documentation

- `docs/ARCHITECTURE.md` — complete system architecture.
- `docs/DEPLOYMENT_VM.md` — step-by-step VM deployment guide.
- `docs/IMPLEMENTATION_REPORT.md` — recent implementation and validation report.
- `ml/docs/EXPERIMENTS.md` — ML experiment guide.
