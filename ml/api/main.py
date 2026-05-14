"""
main.py — Punto de entrada de la API ML de DetectVID.

Arranca con:
    uvicorn api.main:app --reload --port 8000

Al iniciar:
1. Carga el modelo UNA sola vez (PyTorchModelService.__init__)
2. Inyecta el controller en las rutas
3. Levanta el servidor HTTP

Si en el futuro querés cambiar la implementación del modelo
(ONNX, API externa, etc.), solo cambiás la línea de instanciación
del service. Nada más.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.predict import router as predict_router, get_controller
from api.services.model_service import PyTorchModelService
from api.controllers.predict_controller import PredictController


# ── Instancia global del servicio (cargada una vez) ───────────────────────────
_service: PyTorchModelService = None
_controller: PredictController = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Carga el modelo al arrancar, libera recursos al apagar."""
    global _service, _controller
    _service    = PyTorchModelService()
    _controller = PredictController(_service)
    yield
    _service = None


app = FastAPI(
    title="DetectVID ML API",
    description="Clasificación de enfermedades en hojas de vid mediante deep learning.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Inyección del controller via dependency_overrides (forma correcta en FastAPI)
def get_controller_impl() -> PredictController:
    return _controller

app.dependency_overrides[get_controller] = get_controller_impl

# ── Registrar rutas ───────────────────────────────────────────────────────────
app.include_router(predict_router, prefix="/api/ml", tags=["ML"])
